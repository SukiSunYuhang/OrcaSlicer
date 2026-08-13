# ORCA Sidecar Demo 设计

- **日期**：2026-08-13
- **状态**：已批准，待实现
- **关联方案**：[联机架构重构解决方案（ORCA）](https://snapmaker.feishu.cn/wiki/WQNnw8xVkiMXVvkULMJcttlUndf)
- **关联梳理**：[C++ 侧设备通信依赖梳理（适配准备）](https://snapmaker.feishu.cn/wiki/W7iTwHGTMitouUk15aecEIWBnkg)
- **范围**：demo（Windows 优先），打通最薄链路：C++ 启动时拉起 Flutter sidecar 进程 + 登录态下发

## 1. 背景与目标

ORCA 联机重构方案的终态是「C++ 去除 MQTT 栈，设备通信交给内嵌 Dart CLI sidecar」。在走向终态前，先用一个 demo 验证最薄的集成链路：

1. C++（Orca 桌面壳）启动时拉起独立 Flutter 进程 `snapmaker_connection.exe`；
2. 该进程监听本机 `127.0.0.1:8767`（Flutter 侧已将端口改为 8767）；
3. WebView 触发登录后，C++ 侧通过 HTTP 把登录态下发给 sidecar：

   ```
   POST http://127.0.0.1:8767/api/updateToken
   Content-Type: application/json
   {"token": "<access_token>", "refreshToken": "<refresh_token>"}
   ```

本 demo 只验证「拉起进程 + 登录态下发」这一条单向链路，不涉及设备连接、MQTT、WCP 路由的真正迁移。

## 2. 现状依据（代码锚点）

- `snapmaker_connection` 在本仓**零引用**，属全新组件，需新增启动逻辑。
- **进程拉起范式**：`src/slic3r/Utils/Process.cpp` 已用 `wxExecute(..., wxEXEC_ASYNC)` 拉起本机进程；路径取自 `wxStandardPaths::Get().GetExecutablePath()` 同级目录。
- **resources 定位**：`Slic3r::resources_dir()`（libslic3r 提供）返回 resources 目录，用于定位 `resources/snapmaker_connection.exe`。
- **启动时机**：`GUI_App::on_init_inner`（`GUI_App.cpp:2532`）尾部 `m_initialized = true`（`cpp:3063`）之后是「GUI 初始化完成」的自然挂钩点。
- **HTTP 能力**：`Http::post(url)`（`Http.hpp`）支持 `.header(name, value)`、`.set_post_body(const std::string&)`（`Http.hpp:151`，verbatim 不编码）、`.on_complete / .on_error / .timeout_connect / .timeout_max / .perform() / .perform_sync()`，可发 JSON body。
- **登录态**：
  - `GUI_App::sm_request_login`（`cpp:4243`）发起登录（弹 `SMUserLogin`）；`sw_UserLogin`（`SSWCP.cpp:4588`）只是触发它，**不携带 token**。
  - 登录态统一写入 `m_login_userinfo`，access token 经 `set_user_token()`（`GUI_App.hpp:563`）落地。
  - 登录成功瞬间，access_token 与 refresh_token 同时可得：`OAuthJob::parse_token_response`（`OAuthJob.cpp:30-31`）解析两者；web 登录路径在 `WebSMUserLoginDialog.cpp:222` 调 `set_user_token`。
  - 登出走 `GUI_App::sm_request_user_logout`（`cpp:4283`），已有 `Http::post(url).form_add("token", ...).perform()` 向 Snapmaker revoke 端点注销的先例。

## 3. 方案选型

| 方案 | 说明 | 结论 |
|---|---|---|
| **A 独立 `ConnectionSidecar` 类** | 新增类封装「子进程生命周期 + token 下发」，GUI 启动/退出/登录态三处挂钩 | ✅ 采用 |
| B 散写进 `GUI_App` | 在 `GUI_App` 加 `m_sidecar_pid` 与两个方法 | ❌ `GUI_App` 已超万行，耦合重，演进到真 sidecar 时仍需拆 |

选 A：职责单一，且是 ORCA 终态 sidecar 接入点（替换 `SSWCP_MqttAgent_Instance::m_mqtt_engine_map`）的雏形。

## 4. 组件设计

新文件 `src/slic3r/GUI/ConnectionSidecar.hpp` 与 `ConnectionSidecar.cpp`。

```cpp
// ConnectionSidecar.hpp
#pragma once
#include <string>
namespace Slic3r { namespace GUI {

class ConnectionSidecar {
public:
    static ConnectionSidecar& get();               // 单例，GUI 生命周期内唯一

    void start();                                   // 拉起 sidecar 子进程；就绪后若已登录则补发 token
    void stop();                                    // 终止 sidecar 子进程（Orca 退出时）

    void push_token(const std::string& token,       // 登录成功 / token 刷新：下发完整登录态
                    const std::string& refresh_token);
    void push_logout();                             // 登出：下发空 token

private:
    ConnectionSidecar() = default;
    long m_pid = 0;
    bool m_started = false;

    void doPost(const std::string& token,           // 实际 POST，含「连接拒绝」有限重试
                const std::string& refresh_token);
    bool ensureStarted();                           // 计算路径并 wxExecute；返回是否成功拉起
};

}} // namespace
```

**职责边界**：只管「拉起/关闭进程 + 下发 token HTTP」。不解析 WCP、不碰 MQTT、不持有 PrintHost。

## 5. 挂钩点

| 事件 | 位置 | 动作 |
|---|---|---|
| 启动 | `GUI_App::on_init_inner` 尾部（`cpp:3063` `m_initialized=true` 之后） | `ConnectionSidecar::get().start()` |
| 退出 | `GUI_App::OnExit` / 析构（plan 阶段定位确切钩子） | `ConnectionSidecar::get().stop()` |
| 登录成功 | `OAuthJob` 完成回调 与 `WebSMUserLoginDialog.cpp:222` `set_user_token` 之后 | `push_token(access, refresh)` |
| 登出 | `GUI_App::sm_request_user_logout`（`cpp:4283`） | `push_logout()` |

「启动补发 + 事件增量」语义：
- `start()` 内：进程拉起后若 `m_login_userinfo.is_user_login()` 为真，立即 `push_token(...)` 补发当前态；
- 登录成功 / 登出运行中事件分别 `push_token` / `push_logout`。

## 6. 关键实现细节

### 6.1 进程拉起（`ensureStarted`）

仿 `Utils/Process.cpp`：

```cpp
wxString exe = from_u8(Slic3r::resources_dir()) + wxString("/snapmaker_connection.exe"); // Windows
m_pid = wxExecute(exe, wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE);
m_started = (m_pid > 0);
if (!m_started) BOOST_LOG_TRIVIAL(error) << "sidecar: failed to spawn " << into_u8(exe);
```

- **跨平台**：demo 先保证 Windows；macOS/Linux 路径差异用 `#ifdef` 占位并标 `TODO(demo)`（macOS 二进制名可能无 `.exe` 后缀、位于 `.app/Contents/Resources`）。
- 失败仅记日志，**不阻塞 GUI**，不弹窗。

### 6.2 JSON 下发（`doPost`）

```cpp
nlohmann::json body = {
    {"token", token},
    {"refreshToken", refresh_token}
};
Http::post("http://127.0.0.1:8767/api/updateToken")
    .header("Content-Type", "application/json")
    .set_post_body(body.dump())
    .timeout_connect(3)
    .timeout_max(5)
    .on_error([](std::string b, std::string err, unsigned status){
        BOOST_LOG_TRIVIAL(warning) << "sidecar push failed: " << err << " status=" << status;
    })
    .perform();   // 异步，不阻塞 UI
```

### 6.3 启动就绪问题（真实坑）

sidecar 从被拉起到监听 8767 存在延迟，`start()` 后立即 POST 会 `connection refused`。`doPost` 内部做**有限重试**：仅当 `on_error` 收到连接级失败（sidecar 未就绪）时，按固定退避（如 1s）重试，上限约 5 次 / 总 ~5s；其余错误（HTTP 4xx/5xx）不重试。这样「启动补发」与「登录事件增量」共用同一条带重试的 `doPost`。

> 实现注意：`Http::perform()` 是异步的，重试需在 `on_error` 回调内串行触发或改用 `perform_sync()` 在后台线程。plan 阶段定具体形态（倾向：`doPost` 跑在独立工作线程，循环 `perform_sync` 直到成功或耗尽重试）。

### 6.4 登出

`push_logout()` 即 `doPost("", "")`，sidecar 侧收到空 token 视为登出。

## 7. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/slic3r/GUI/ConnectionSidecar.hpp` | **新增** |
| `src/slic3r/GUI/ConnectionSidecar.cpp` | **新增** |
| `src/slic3r/GUI/GUI_App.cpp` | `on_init_inner` 尾部 + `start()`；退出钩子 + `stop()`；`sm_request_user_logout` + `push_logout()` |
| `src/slic3r/GUI/Jobs/OAuthJob.cpp` 与/或 `WebSMUserLoginDialog.cpp` | 登录成功处 + `push_token(access, refresh)` |
| `src/slic3r/GUI/CMakeLists.txt` | 将两个新源文件列入 `libslic3r_gui` |

## 8. 待确认项（plan 阶段落实）

1. **refreshToken 持久化**：`m_login_userinfo`（UserInfo）是否长期持有 refresh_token？
   - 若**持久化**：启动补发可发完整 `{token, refreshToken}`。
   - 若**未持久化**（refresh 仅在 `OAuthResult` 瞬时存在）：启动补发只能发 `{token, ""}`，登录成功事件才发全量。需读 UserInfo 字段确认。
2. **退出钩子确切位置**：`GUI_App::OnExit` 是否存在并被调用，或用析构；定位后挂钩 `stop()`。
3. **登录成功挂钩点的统一性**：是否所有登录路径（原生 OAuth、web 登录）都汇聚到一个可挂钩的「登录成功」出口，还是需在 `OAuthJob` 与 `WebSMUserLoginDialog` 两处分别挂。优先找统一出口（如 `set_user_token` 的所有 caller，或在 setter 内置钩子）。
4. **CMake 目标名**：确认新增源文件应列入的目标（`libslic3r_gui`）与现有列式一致。

## 9. 风险与后续

- **默认启用**：本 demo 按用户决策「默认开」实现——所有构建启动即拉 sidecar、尝试下发 token。合并到团队主线前**强烈建议**补一个 Preferences 开关（如 `enable_connection_sidecar`，默认关），避免影响其他人与 CI。当前实现预留可加开关的结构（`start()` 内读 app_config 即可 gating）。
- **进程残留**：若 Orca 异常崩溃，`wxKill` 不触发，sidecar 可能残留。demo 不处理（Orca 正常退出已覆盖）。
- **端口冲突**：8767 被占用时 sidecar 启动失败由其自身处理；C++ 侧 `doPost` 重试耗尽后仅记日志。
- **安全**：`127.0.0.1:8767` 仅本机可达；token 经明文 HTTP 传给同机 sidecar，与 sidecar 自身信任域一致，demo 可接受。

## 10. 验收标准

demo 成功的定义：

1. 启动 Orca → 任务管理器可见 `snapmaker_connection.exe` 子进程；日志有 `sidecar started, pid=...`。
2. 完成登录 → 抓包/日志可见 C++ 向 `127.0.0.1:8767/api/updateToken` 发了 `{"token":..,"refreshToken":..}`；sidecar 侧确认收到非空 token。
3. 登出 → C++ 发了空 token；sidecar 侧确认收到空 token。
4. 启动时若已登录（重启 Orca 保持登录态）→ `start()` 后自动补发一次 token。
5. 退出 Orca → `snapmaker_connection.exe` 子进程随之结束。
6. sidecar 未启动 / 端口未就绪时，C++ 不崩溃、不卡 UI，仅记 warning 日志。
