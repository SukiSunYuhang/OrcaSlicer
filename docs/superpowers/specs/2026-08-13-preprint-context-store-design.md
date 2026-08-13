# 预打印上下文交接（store 接口）设计

- **日期**：2026-08-13
- **状态**：已批准，待实现
- **关联**：[ORCA sidecar demo](./2026-08-13-orca-sidecar-demo-design.md)（同一 sidecar `127.0.0.1:8767`）
- **范围**：Orca → web 预打印上下文交接；C++ 在开预打印窗前把「活动 gcode + 耗材/喷嘴映射」推进 sidecar store，web 按地址栏 id 取回

## 1. 背景与目标

预打印页（Flutter Web，由 `WebPreprintDialog` 承载）需要「活动 gcode + 当前盘耗材/喷嘴映射」，这属于切片态，**只有 Orca(C++) 进程知道**，sidecar（device_cmd）造不出来。方案：Orca 在开窗前把上下文 POST 进 sidecar 的 `/api/store`，web 打开后按 URL 里的 `id` GET 取回。

```
① C++  POST /api/store {"id":"<uuid>","payload":{…},"ttl_seconds":1800}
② C++  WebView → /web/flutter_web/index.html?path=4&id=<uuid>
③ web  GET  /api/store/<uuid>
```

store server 由 sidecar（device_cmd，`127.0.0.1:8767`）提供；device_cmd 原样存原样取，不解释 payload 内容，但会对 `file_path` 做 `stat` 校验。

## 2. 现状依据（代码锚点）

- **触发点**：`Plater.cpp:20617` —— 上传打印流程（`PrintHostSendDialog` 选路径后）`new WebPreprintDialog()` → `run()`。此处已有 `upload_job.upload_data.source_path`（gcode 本机路径）和 `upload_data.upload_path`（显示名）。
- **WebView 开窗已现成**：`WebPreprintDialog.cpp:20-24` 已 load `127.0.0.1:8767/web/flutter_web/index.html?path=4`（preprint）和 `?path=5`（presend）。8767 即 sidecar。本需求只需追加 `&id=<uuid>`。
- **数据源（WCP 现有）**：
  - `SSWCP_Instance::sw_GetActiveFile`（`SSWCP.cpp:691`）：非 zip 分支（`:760-773`）同步构造 `file_name/file_path/origin_size/checksum/url/metadata`；zip 分支（`:719-758`）异步压缩。
  - `SSWCP_MachineOption_Instance::sw_GetFileFilamentMapping`（`SSWCP.cpp:3223`）：纯同步，读 print config + slice result，产出 `estimated_time/filament_color*/filament_type/nozzle_diameters/filament_weight*…`。
- **uuid**：`boost::uuids::random_generator()()` 有先例（`Plater.cpp:16846`）。
- **POST 客户端**：`Http::post(url).header().set_post_body(json).perform_sync()`（`Http.hpp`，sidecar demo 已验证可用）。
- **HTTP 鉴权**：sidecar `/api/store` 是否需 Bearer/HMAC 未在需求中说明；demo 假定本机回环免鉴权（与 `/api/updateToken` 一致），若 sidecar 要求再补 header。

## 3. 方案选型

| 方案 | 说明 | 结论 |
|---|---|---|
| **A 抽 builder 复用** | 把两个 sw_ 的 json 构造抽成静态 builder，handler 与触发点共用 | ✅ 采用 |
| B 触发点简化构造 | 触发点内联只填 file_path/file_name | ❌ 字段不全，web 需适配 |
| C 同步包装 sw_ handler | 触发点同步调 WCP handler | ❌ handler 异步 + WCP 耦合，包装复杂 |

## 4. 组件设计

### 4.1 SSWCP 静态 builder（新增 + 改 handler）

```cpp
// SSWCP.hpp（静态方法，与 get_active_filename 同区）
static nlohmann::json build_active_file_json(const std::string& file_path,
                                             const std::string& file_name,
                                             bool is_zip = false);
static nlohmann::json build_filament_mapping_json(const std::string& filename);
```

- `build_active_file_json`：抽 `sw_GetActiveFile` **非 zip 分支**（`file_name/file_path/origin_size/checksum/url/metadata`）。`is_zip=true` 分支暂返回与非 zip 相同结构（原始路径），zip 压缩逻辑保留在 handler 内不动（多盘 3mf 场景后续）。
- `build_filament_mapping_json`：抽 `sw_GetFileFilamentMapping` 全部同步逻辑。
- `sw_GetActiveFile` / `sw_GetFileFilamentMapping` handler 改为**调 builder 填 `m_res_data`** → WCP 回包形状不变，web 零改。

### 4.2 PreprintContextStore（新类，POST /api/store 同步客户端）

```cpp
// PreprintContextStore.hpp
class PreprintContextStore {
public:
    struct StoreResult {
        bool        ok          = false;   // HTTP 200 且响应 ok=true
        bool        file_exists = true;    // sidecar stat file_path 的结果
        std::string error;                 // 失败原因
    };
    static PreprintContextStore& get();
    StoreResult store(const std::string& id, const nlohmann::json& payload, int ttl_seconds = 1800);
};
```

- `store()`：`Http::post("http://127.0.0.1:8767/api/store").header("Content-Type","application/json").set_post_body({{"id",id},{"payload",payload},{"ttl_seconds",ttl}}.dump()).timeout_connect(3).timeout_max(5).perform_sync()`，`on_complete` 解析 `ok/file_exists`，`on_error` 填 error。
- 单例（GUI 生命周期内复用 host 配置）。职责单一：只做 store POST + 解析，不碰进程/token（那是 `ConnectionSidecar`）。

### 4.3 WebPreprintDialog 改（URL 追加 &id）

- 加 `void set_store_id(const std::string& id)` + 私有成员 `std::string m_store_id`。
- 现有 `m_prePrint_url`（`?path=4`）/`m_preSend_url`（`?path=5`）：`m_store_id` 非空时在 `load_url`/`run` 拼接前 `+= "&id=" + m_store_id`；空则不拼（向后兼容现有调用）。

### 4.4 Plater.cpp:20617 编排（触发点）

在 `dialog->set_display_file_name(...)` 之后、`dialog->run()` 之前插入：

```cpp
std::string active_filename = SSWCP::get_active_filename();
nlohmann::json payload;
payload["file_path"] = upload_job.upload_data.source_path.string();
payload["filename"]  = upload_job.upload_data.upload_path.string();
payload["active_file"]      = SSWCP::build_active_file_json(
        upload_job.upload_data.source_path.string(),
        upload_job.upload_data.upload_path.string(), /*is_zip=*/false);
payload["filament_mapping"] = SSWCP::build_filament_mapping_json(active_filename);

auto  uuid = boost::uuids::to_string(boost::uuids::random_generator()());
auto  res  = PreprintContextStore::get().store(uuid, payload);
if (!res.ok) {
    BOOST_LOG_TRIVIAL(error) << "preprint store failed: " << res.error;
    // 弹 MessageDialog：sidecar 未就绪，是否仍打开预打印页（继续则 id 传空）
    if (用户取消) { delete dialog; return; }
    uuid.clear();   // 继续则不带 id
} else if (!res.file_exists) {
    BOOST_LOG_TRIVIAL(warning) << "preprint store: file_path not found, continuing";
    // 弹 MessageDialog：文件路径无效，是否继续（用户决策"警告后继续"）
    MessageDialog(...).ShowModal();   // 用户确认后继续
}
dialog->set_store_id(uuid);
bool r = dialog->run();
```

## 5. POST /api/store 报文（沿用需求约定）

请求：
```json
POST /api/store
{ "id": "<uuid>", "payload": { "file_path","filename","active_file","filament_mapping" }, "ttl_seconds": 1800 }
```
响应（sidecar 给）：
```json
{ "ok": true, "data": { "id","saved_at","expires_at","bytes","keys","file_path","filename","file_exists" } }
```
`file_path` 四级 fallback（sidecar 解析，C++ 只管顶层 `payload.file_path` + `active_file.file_path`）：`payload.file_path` → `payload.path` → `active_file.file_path` → `active_file.path`。

## 6. 错误处理

| 情况 | 处理 |
|---|---|
| POST 200 且 `ok=true` 且 `file_exists=true` | 正常拼 `&id` 开窗 |
| `file_exists=false` | log warn + `MessageDialog`「文件路径无效，是否继续」→ 用户确认后带 id 开窗（"警告后继续"） |
| POST 失败 / sidecar 未起 / 超时 | log error + `MessageDialog`「预打印上下文未推送（sidecar 未就绪），是否仍打开」→ 继续：id 传空（web GET 将 404）；取消：`delete dialog; return` |
| builder 失败（无 active file / 无 slice result） | 沿用 sw_ 现有 fail 行为（`handle_general_fail` 等价：记日志，不带 id 开窗或提示），不崩溃 |

## 7. 文件清单

| 文件 | 改动 |
|---|---|
| `src/slic3r/GUI/SSWCP.hpp/.cpp` | 加 2 个静态 builder；`sw_GetActiveFile`/`sw_GetFileFilamentMapping` 改调 builder |
| `src/slic3r/GUI/PreprintContextStore.hpp/.cpp` | **新增** |
| `src/slic3r/GUI/WebPreprintDialog.hpp/.cpp` | `set_store_id` + URL 拼 `&id` |
| `src/slic3r/GUI/Plater.cpp`（~20617） | 编排：构造 payload + POST + 弹窗 + `set_store_id` |
| `src/slic3r/CMakeLists.txt` | 加 `PreprintContextStore.cpp/.hpp` 到 `SLIC3R_GUI_SOURCES` |

## 8. 范围与默认

- **非 zip**：demo 走单盘 `.gcode`；zip 多盘分支保留在 handler 不抽（后续）。
- **POST 同步**：本机 sidecar 回环 <1s，触发点同步 `perform_sync`；如实测卡 UI，再挪 `std::thread` + 开窗回调。
- **默认启用**：与 sidecar demo 一致，不加开关。
- **鉴权**：假定 `/api/store` 本机回环免鉴权；若 sidecar 要求 Bearer/HMAC，在 `PreprintContextStore::store` 补 header。

## 9. 验收标准

1. 点「上传打印」→ `WebPreprintDialog` 打开，URL 含 `&id=<uuid>`（非空）。
2. sidecar 侧日志/存储可见该 id 的 payload，`file_exists=true`。
3. 故意把 `file_path` 改成不存在路径 → C++ 弹「路径无效，是否继续」，确认后仍开窗，sidecar 记 `file_exists=false` 的 warn。
4. 临时停掉 sidecar → C++ 弹「未就绪，是否仍打开」，取消则不开窗。
5. web 侧 `GET /api/store/<uuid>` 取到 payload，`active_file`/`filament_mapping` 字段与现 WCP 回包形状一致（web 解析代码不改）。
6. 现有 WCP `sw_GetActiveFile`/`sw_GetFileFilamentMapping` 回包形状不变（回归：通过 WebView 调这两命令的旧行为不受影响）。
