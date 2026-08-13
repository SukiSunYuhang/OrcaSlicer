# 预打印上下文交接（store 接口）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** C++ 在打开预打印 WebView 前，把「活动 gcode + 耗材/喷嘴映射」POST 进 sidecar `/api/store`，WebView URL 带 `id`，web 按 `id` GET 取回。

**Architecture:** 抽 SSWCP 两个 json 构造为静态 builder（handler 与触发点共用，WCP 回包形状不变）；新增 `PreprintContextStore` 同步 POST `/api/store`；`WebPreprintDialog` URL 追加 `&id`；`Plater` 打印触发点编排。

**Tech Stack:** C++17、wxWidgets、`Http`（libcurl 封装）、nlohmann::json、boost::uuid、CMake。

**Spec:** `docs/superpowers/specs/2026-08-13-preprint-context-store-design.md`

## Global Constraints

- **验证方式**：每个 Task 用 `cmake --build build --config Release --target libslic3r_gui`（前台，600s 内；超时转后台等待）。**不用** `build_release_vs2022.bat slicer`（ALL_BUILD+install 耗时长，后台易被 kill）。
- **回归红线**：现有 WCP `sw_GetActiveFile` / `sw_GetFileFilamentMapping` 的回包 JSON 形状必须不变（WebView 旧调用行为不受影响）。
- **范围**：demo 走非 zip（单盘 `.gcode`）；zip 多盘分支保留在 handler 不抽。
- **POST 同步**：`PreprintContextStore::store` 用 `perform_sync`（本机回环 <1s）。
- **默认启用**：不加 Preferences 开关。
- **鉴权**：假定 `/api/store` 本机回环免鉴权（与 `/api/updateToken` 一致）；若 sidecar 要求再补 header。
- **commit**：conventional（`feat:`/`refactor:`），只 `git add` 本 Task 改动文件，**禁 `git add -A`**，不 push。
- **GUI 无单测**：本项目 `libslic3r_gui` 无单测设施，验证 = Release 编译通过（Task 1-5）+ Task 6 手动验收。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/slic3r/GUI/SSWCP.hpp/.cpp` | 新增 2 个静态 builder；2 个 handler 改调 builder | 修改 |
| `src/slic3r/GUI/PreprintContextStore.hpp/.cpp` | POST `/api/store` 同步客户端 | 新增 |
| `src/slic3r/GUI/WebPreprintDialog.hpp/.cpp` | `set_store_id` + URL 拼 `&id` | 修改 |
| `src/slic3r/GUI/Plater.cpp`（~20617） | 打印触发点编排 | 修改 |
| `src/slic3r/CMakeLists.txt` | 加 `PreprintContextStore` 源文件 | 修改 |

**关键 API（已确认）**：
- `SSWCP::get_active_filename()` / `get_display_filename()`（静态，`SSWCP.cpp` 现有）。
- `calc_sha256_base64(path)`、`Http::url_encode(s)`、`LOCALHOST_URL`（`SSWCP.cpp` 现用）。
- `Http::post(url).header(name,val).set_post_body(json).timeout_connect(s).timeout_max(s).on_complete(fn).on_error(fn).perform_sync()`。
- `boost::uuids::random_generator()()` + `boost::uuids::to_string(u)`（`Plater.cpp:16846` 先例）。
- `MessageDialog(parent, msg, title, wxYES_NO|wxICON_WARNING).ShowModal()`。

---

### Task 1: 抽 build_active_file_json + 改 sw_GetActiveFile 非 zip 分支

**Files:**
- Modify: `src/slic3r/GUI/SSWCP.hpp`（加静态方法声明）
- Modify: `src/slic3r/GUI/SSWCP.cpp`：新增 builder + metadata helper；`sw_GetActiveFile`（`:691-775`）非 zip 分支（`:760-773`）改调 builder。

**Interfaces:**
- Produces: `SSWCP::build_active_file_json(file_path, file_name, is_zip=false) -> nlohmann::json`（Task 5 触发点用）。

- [ ] **Step 1: SSWCP.hpp 加声明**

在 `SSWCP` 类中 `get_active_filename` 声明附近加：

```cpp
static nlohmann::json build_active_file_metadata();
static nlohmann::json build_active_file_json(const std::string& file_path,
                                             const std::string& file_name,
                                             bool is_zip = false);
```

- [ ] **Step 2: SSWCP.cpp 加 builder 实现**

放在 `sw_GetActiveFile`（`:691`）之前。逻辑抽自 `sw_GetActiveFile` 的 metadata 块（`:704-717`）与非 zip 块（`:760-773`）：

```cpp
nlohmann::json SSWCP::build_active_file_metadata()
{
    nlohmann::json metadata_json = nlohmann::json::object();
    if (wxGetApp().model().model_info) {
        auto& items = wxGetApp().model().model_info->metadata_items;
        auto lookup = [&](const std::string& key) {
            auto it = items.find(key);
            if (it != items.end()) metadata_json[key] = it->second;
        };
        lookup("DesignModelId");
        lookup("DesignProfileId");
        lookup("DesignRegion");
    }
    return metadata_json;
}

nlohmann::json SSWCP::build_active_file_json(const std::string& file_path,
                                             const std::string& file_name,
                                             bool /*is_zip*/)
{
    nlohmann::json res;
    res["metadata"] = build_active_file_metadata();
    res["file_name"] = file_name;
    std::string url_path = file_path;
    std::replace(url_path.begin(), url_path.end(), '\\', '/');
    res["file_path"]   = file_path;
    res["origin_size"] = boost::filesystem::file_size(file_path);
    res["checksum"]    = calc_sha256_base64(file_path);
    res["url"]         = std::string(LOCALHOST_URL) + "8767" + "/localfile/" + Http::url_encode(url_path);
    return res;
}
```

- [ ] **Step 3: 改 sw_GetActiveFile 非 zip 分支调 builder**

`SSWCP.cpp:691` 的 `sw_GetActiveFile`：
- 删除原公共 metadata 块（`:704-717`，即 `json metadata_json = ...; ... m_res_data["metadata"] = metadata_json;`）。
- 非 zip 分支（`:760-773`，`else { m_res_data["file_name"] = ... }` 整段）替换为：

```cpp
    } else {
        m_res_data = SSWCP::build_active_file_json(file_path, file_name, false);
        send_to_js();
        finish_job();
    }
```

- zip 分支（`:719-758`，异步 lambda）在 lambda 内、填 `m_res_data["file_name"]` 之前补一行 `self->m_res_data["metadata"] = SSWCP::build_active_file_metadata();`（补回被删的公共 metadata）。
- 保留 `file_path/file_name` 空检查（`:695-698`）与 `iszip` 读取（`:700-702`）不动。

- [ ] **Step 4: 编译验证**

Run: `cmake --build build --config Release --target libslic3r_gui`
Expected: 通过，无 error（pre-existing warning 无妨）。

- [ ] **Step 5: Commit**

```bash
git add src/slic3r/GUI/SSWCP.hpp src/slic3r/GUI/SSWCP.cpp
git commit -m "refactor: extract build_active_file_json, sw_GetActiveFile reuses it"
```

---

### Task 2: 抽 build_filament_mapping_json + 改 sw_GetFileFilamentMapping

**Files:**
- Modify: `src/slic3r/GUI/SSWCP.hpp`（加静态方法声明）
- Modify: `src/slic3r/GUI/SSWCP.cpp`：`sw_GetFileFilamentMapping`（`:3223`）函数体移入 builder，handler 改调 builder。

**Interfaces:**
- Produces: `SSWCP::build_filament_mapping_json(filename) -> nlohmann::json`（Task 5 触发点用）。

- [ ] **Step 1: SSWCP.hpp 加声明**

```cpp
static nlohmann::json build_filament_mapping_json(const std::string& filename);
```

- [ ] **Step 2: SSWCP.cpp 新增 builder（移函数体）**

新增 `SSWCP::build_filament_mapping_json`，把 `sw_GetFileFilamentMapping`（`:3223` 起，从 `try {` 到 `response` 构造完成、`send_to_js/finish_job` 之前）的**全部 response 构造逻辑**原样移入：

```cpp
nlohmann::json SSWCP::build_filament_mapping_json(const std::string& filename)
{
    // 原 sw_GetFileFilamentMapping 函数体（SSWCP.cpp:3225-3400 区间的 response 构造逻辑）
    // —— 从 filename 空检查、文件存在检查、取 print/config/slice_result，
    //    到 estimated_time / filament_color* / filament_type / nozzle_diameters /
    //    filament_weight* / filament length 等全部 response[...] 赋值 —— 原样搬入。
    // 末尾：return response;  （原来是 m_res_data = response; send_to_js(); finish_job();）
}
```

> 实现要点：原函数对 `filename==""` 与文件不存在时调 `handle_general_fail()` 并 return——在 builder 里改为 `return nlohmann::json::object();`（空对象），由调用方（handler 与 Task 5 触发点）自行判断空对象决定是否 fail。

- [ ] **Step 3: sw_GetFileFilamentMapping 改调 builder**

`SSWCP.cpp:3223` 的 `sw_GetFileFilamentMapping` 替换为：

```cpp
void SSWCP_MachineOption_Instance::sw_GetFileFilamentMapping()
{
    try {
        std::string filename = m_param_data.count("filename") ? m_param_data["filename"].get<std::string>() : "";
        if (filename == "") filename = SSWCP::get_active_filename();
        if (filename == "") { handle_general_fail(); return; }
        nlohmann::json response = SSWCP::build_filament_mapping_json(filename);
        if (response.is_null() || response.empty()) { handle_general_fail(); return; }
        m_res_data = response;
        send_to_js();
        finish_job();
    } catch (std::exception& e) {
        handle_general_fail();
    }
}
```

- [ ] **Step 4: 编译验证**

Run: `cmake --build build --config Release --target libslic3r_gui`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/slic3r/GUI/SSWCP.hpp src/slic3r/GUI/SSWCP.cpp
git commit -m "refactor: extract build_filament_mapping_json, sw_GetFileFilamentMapping reuses it"
```

---

### Task 3: 新增 PreprintContextStore + CMake 注册

**Files:**
- Create: `src/slic3r/GUI/PreprintContextStore.hpp`
- Create: `src/slic3r/GUI/PreprintContextStore.cpp`
- Modify: `src/slic3r/CMakeLists.txt`（`SLIC3R_GUI_SOURCES` 加两行）

**Interfaces:**
- Consumes: `Http::post`/`set_post_body`/`header`/`perform_sync`、`nlohmann::json`。
- Produces: `PreprintContextStore::get()` / `store(id, payload, ttl) -> StoreResult`（Task 5 用）。

- [ ] **Step 1: 写头文件**

```cpp
#pragma once
#include <string>
#include "nlohmann/json.hpp"
namespace Slic3r { namespace GUI {

class PreprintContextStore {
public:
    struct StoreResult {
        bool        ok          = false;   // HTTP 200 且响应 ok=true
        bool        file_exists = true;    // sidecar stat file_path 结果
        std::string error;                 // 失败原因
    };

    static PreprintContextStore& get();
    // 同步 POST /api/store；本机回环，perform_sync 阻塞 <1s。
    StoreResult store(const std::string& id, const nlohmann::json& payload, int ttl_seconds = 1800);
private:
    PreprintContextStore() = default;
};

}} // namespace Slic3r::GUI
```

- [ ] **Step 2: 写实现**

```cpp
#include "PreprintContextStore.hpp"
#include "../Utils/Http.hpp"
#include <boost/log/trivial.hpp>

namespace Slic3r { namespace GUI {

PreprintContextStore& PreprintContextStore::get() {
    static PreprintContextStore inst;
    return inst;
}

PreprintContextStore::StoreResult PreprintContextStore::store(const std::string& id,
                                                              const nlohmann::json& payload,
                                                              int ttl_seconds)
{
    StoreResult out;
    nlohmann::json body;
    body["id"]           = id;
    body["payload"]      = payload;
    body["ttl_seconds"]  = ttl_seconds;
    const std::string payload_str = body.dump();

    Http::post("http://127.0.0.1:8767/api/store")
        .header("Content-Type", "application/json")
        .set_post_body(payload_str)
        .timeout_connect(3)
        .timeout_max(5)
        .on_complete([&](std::string resp, unsigned /*status*/) {
            try {
                auto j = nlohmann::json::parse(resp);
                out.ok = j.value("ok", false);
                if (j.contains("data") && j["data"].contains("file_exists"))
                    out.file_exists = j["data"]["file_exists"].get<bool>();
                if (!out.ok) out.error = "store responded ok=false";
            } catch (std::exception& e) {
                out.ok = false;
                out.error = std::string("bad response: ") + e.what();
            }
        })
        .on_error([&](std::string /*body*/, std::string err, unsigned status) {
            out.ok = false;
            out.error = "status=" + std::to_string(status) + " err=" + err;
        })
        .perform_sync();

    if (!out.ok)
        BOOST_LOG_TRIVIAL(warning) << "preprint store failed id=" << id << " " << out.error;
    return out;
}

}} // namespace Slic3r::GUI
```

- [ ] **Step 3: CMake 注册**

在 `src/slic3r/CMakeLists.txt` 的 `SLIC3R_GUI_SOURCES` list 中（紧接 Task1 已加的 `GUI/ConnectionSidecar.cpp/.hpp` 之后）加：

```cmake
        GUI/PreprintContextStore.cpp
        GUI/PreprintContextStore.hpp
```

- [ ] **Step 4: 编译验证**

Run: `cmake --build build --config Release --target libslic3r_gui`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/slic3r/GUI/PreprintContextStore.hpp src/slic3r/GUI/PreprintContextStore.cpp src/slic3r/CMakeLists.txt
git commit -m "feat: add PreprintContextStore (POST /api/store, sync)"
```

---

### Task 4: WebPreprintDialog 加 set_store_id + URL 拼 &id

**Files:**
- Modify: `src/slic3r/GUI/WebPreprintDialog.hpp`（加 `set_store_id` + `m_store_id`）
- Modify: `src/slic3r/GUI/WebPreprintDialog.cpp`（`run()` 构造 real_url 处拼 `&id`）

**Interfaces:**
- Produces: `WebPreprintDialog::set_store_id(id)`（Task 5 调）。

- [ ] **Step 1: hpp 加声明与成员**

`WebPreprintDialog.hpp` public 区（`set_send_page` 附近）加：

```cpp
    void set_store_id(const std::string& id) { m_store_id = id; }
```

private 成员区（`m_switch_to_device` 附近）加：

```cpp
    std::string m_store_id;
```

并在文件头 include 区加 `#include <string>`（若未有）。

- [ ] **Step 2: cpp 的 run() 拼 &id**

`WebPreprintDialog.cpp:134` 附近，`run()` 里构造 `real_url` 处：

```cpp
    auto base_url = m_send_page ? m_preSend_url : m_prePrint_url;
    wxString real_url = wxGetApp().get_international_url(base_url);
    if (!m_store_id.empty())
        real_url += "&id=" + from_u8(m_store_id);
    // 之后用 real_url 加载（保持原 load/ShowModal 流程不变）
```

> `from_u8` 来自 `GUI.hpp`（`WebPreprintDialog.cpp` 已通过其它 GUI 头间接可用；若 clangd 报错则 `#include "GUI.hpp"`）。原 `:134` 直接用 `wxGetApp().get_international_url(m_prePrint_url)` 的写法替换为上面 base_url + 追加 id。

- [ ] **Step 3: 编译验证**

Run: `cmake --build build --config Release --target libslic3r_gui`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/slic3r/GUI/WebPreprintDialog.hpp src/slic3r/GUI/WebPreprintDialog.cpp
git commit -m "feat: WebPreprintDialog appends &id=<store_id> to url"
```

---

### Task 5: Plater 打印触发点编排

**Files:**
- Modify: `src/slic3r/GUI/Plater.cpp`：`~20617`（`WebPreprintDialog* dialog = new WebPreprintDialog();` 之后、`dialog->run()` 之前）。

**Interfaces:**
- Consumes: Task 1 `SSWCP::build_active_file_json`、Task 2 `SSWCP::build_filament_mapping_json`、Task 3 `PreprintContextStore::store`、Task 4 `WebPreprintDialog::set_store_id`。

- [ ] **Step 1: 补 include**

`Plater.cpp` include 区（已有 `boost/uuid` 则跳过，`Plater.cpp:16846` 用过）确认/追加：

```cpp
#include "SSWCP.hpp"
#include "PreprintContextStore.hpp"
#include <boost/uuid/uuid.hpp>
#include <boost/uuid/uuid_generators.hpp>
#include <boost/uuid/uuid_io.hpp>
#include "MsgDialog.hpp"   // MessageDialog / InfoDialog
```

- [ ] **Step 2: 插入编排逻辑**

在 `Plater.cpp:20621`（`dialog->set_display_file_name(upload_job.upload_data.upload_path.string());`）之后、`bool res = dialog->run();`（`:20622`）之前插入：

```cpp
        // ORCA 预打印上下文交接：构造 payload → POST /api/store → 带 id 开窗
        std::string src_path  = upload_job.upload_data.source_path.string();
        std::string disp_name = upload_job.upload_data.upload_path.string();
        std::string active_filename = SSWCP::get_active_filename();

        nlohmann::json payload;
        payload["file_path"] = src_path;
        payload["filename"]  = disp_name;
        payload["active_file"]      = SSWCP::build_active_file_json(src_path, disp_name, false);
        payload["filament_mapping"] = SSWCP::build_filament_mapping_json(active_filename);

        std::string store_id = boost::uuids::to_string(boost::uuids::random_generator()());
        auto sres = PreprintContextStore::get().store(store_id, payload);

        if (!sres.ok) {
            BOOST_LOG_TRIVIAL(error) << "preprint store failed: " << sres.error;
            MessageDialog dlg(this, _L("Pre-print context was not pushed (sidecar not ready). Open anyway?"),
                              _L("Note"), wxYES_NO | wxICON_WARNING);
            if (dlg.ShowModal() != wxID_YES) { delete dialog; return; }
            store_id.clear();   // 继续则不带 id
        } else if (!sres.file_exists) {
            BOOST_LOG_TRIVIAL(warning) << "preprint store: file_path not found, continuing";
            MessageDialog dlg(this, _L("The G-code path is invalid. Continue anyway?"),
                              _L("Note"), wxYES_NO | wxICON_WARNING);
            if (dlg.ShowModal() != wxID_YES) { delete dialog; return; }
        }

        dialog->set_store_id(store_id);
```

- [ ] **Step 3: 编译验证**

Run: `cmake --build build --config Release --target libslic3r_gui`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/slic3r/GUI/Plater.cpp
git commit -m "feat: push preprint context to sidecar store before opening WebPreprintDialog"
```

---

### Task 6: 构建确认 + 手动验收

**Files:** 无（验证任务）。

- [ ] **Step 1: 完整 lib 构建**

Run: `cmake --build build --config Release --target libslic3r_gui`
Expected: 通过，`libslic3r_gui.lib` 产出。

- [ ] **Step 2: 可运行 exe**

由用户本地跑 `build_release_vs2022.bat slicer` 产出 `snapmaker-orca.exe`（后台完整 build 易被 kill，故本地前台跑）。

- [ ] **Step 3: 对照 spec §9 手动验收**

1. 点「上传打印」→ `WebPreprintDialog` 打开，地址栏 URL 含非空 `&id=<uuid>`。
2. sidecar 侧确认收到该 id 的 payload，`file_exists=true`。
3. 故意把 `file_path` 改成不存在路径 → C++ 弹「路径无效，是否继续」，确认后仍开窗，sidecar 记 `file_exists=false` warn。
4. 临时停掉 sidecar → C++ 弹「未就绪，是否仍打开」，取消则不开窗。
5. web 侧 `GET /api/store/<uuid>` 取到 payload，`active_file`/`filament_mapping` 字段形状与现 WCP 回包一致（web 解析代码不改）。
6. **回归**：通过 WebView 调旧 `sw_GetActiveFile`/`sw_GetFileFilamentMapping` 的行为与改造前一致（回包 JSON 形状不变）。

---

## Self-Review 结果

- **Spec 覆盖**：spec §4.1 builder → Task 1/2；§4.2 PreprintContextStore → Task 3；§4.3 WebPreprintDialog → Task 4；§4.4 Plater 编排 → Task 5；§5 报文 → Task 3 body 构造；§6 错误处理 → Task 5 编排（file_exists 警告 + POST 失败询问）；§9 验收 → Task 6。✅
- **占位扫描**：Task 2「移函数体」指明了精确行号区间（`SSWCP.cpp:3225-3400` 区间）与搬运规则、空对象约定，是 refactor 指令非占位；其余 Task 均给完整代码。✅
- **类型一致性**：`build_active_file_json(file_path,file_name,is_zip=false)`、`build_filament_mapping_json(filename)`、`PreprintContextStore::store(id,payload,ttl)->StoreResult{ok,file_exists,error}`、`set_store_id(id)` 在各 Task 签名一致。✅
