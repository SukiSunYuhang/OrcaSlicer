# ORCA Sidecar Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Orca 桌面壳（C++/wxWidgets）启动时拉起 Flutter sidecar 进程 `snapmaker_connection.exe`，并在登录/登出时把登录态 POST 给 `127.0.0.1:8767/api/updateToken`。

**Architecture:** 新增单一职责的 `ConnectionSidecar` 类（单例），封装子进程生命周期 + token 下发；在 `GUI_App` 的启动 / 退出 / 登录态变更三处挂钩调用。不解析 WCP、不碰 MQTT、不持有 PrintHost。

**Tech Stack:** C++17、wxWidgets（`wxExecute`/`wxKill`）、`Http`（内部 libcurl 封装）、nlohmann::json、CMake。

**Spec:** `docs/superpowers/specs/2026-08-13-orca-sidecar-demo-design.md`

## Global Constraints

- **平台**：demo 先保证 Windows；macOS/Linux 用 `#ifdef` 占位并标 `TODO(demo)`，不阻塞。
- **构建**：Windows 用 `build_release_vs2022.bat slicer`（**Release 配置**——deps 无 Debug 库；假设依赖已构建）。增量构建 `libslic3r_gui` target 即可验证编译。
- **refreshToken**：C++ 侧 `SMUserInfo` 无 refresh_token 字段，web 登录流程（`WebSMUserLoginDialog.cpp:196-231`）也只回传 access token。**demo 全程 `refreshToken` 下发空字符串**；access token 是主体。不扩展 SMUserInfo、不改 web 登录契约。
- **验证策略**：本项目 GUI 层（`libslic3r_gui`）无单元测试设施，且 demo 依赖外部进程 + wxApp 运行时。因此每个任务的验证 = **Release 增量编译通过**（Task 1-6）+ **Task 7 对照 spec §10 的手动验收清单**。不新增 catch2 单测。
- **commit 规范**：conventional commit（`feat:`/` chore:`），每个 task 末尾 commit；**只 `git add` 本 task 改动的源文件，禁止 `git add -A`**；不 push。
- **默认启用**：按 spec，所有构建启动即拉 sidecar，不加 Preferences 开关。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/slic3r/GUI/ConnectionSidecar.hpp` | `ConnectionSidecar` 单例类声明：`start/stop/push_token/push_logout` | 新增 |
| `src/slic3r/GUI/ConnectionSidecar.cpp` | 实现：进程拉起/终止、JSON POST + 重试、启动补发 | 新增 |
| `src/slic3r/CMakeLists.txt` | 把两个新源文件加入 `SLIC3R_GUI_SOURCES` | 修改 |
| `src/slic3r/GUI/GUI_App.cpp` | `on_init_inner` 尾部 +`start()`；`OnExit` +`stop()`；`sm_request_user_logout` +`push_logout()` | 修改 |
| `src/slic3r/GUI/WebSMUserLoginDialog.cpp` | `:222` `set_user_token` 之后 +`push_token(token, "")` | 修改 |

**关键 API（已确认，直接用）**：
- `Slic3r::resources_dir()` → `std::string`（libslic3r，resources 目录绝对路径）。
- `long wxExecute(wxString cmd, int flags)` → 返回 pid（>0 成功）；flag 用 `wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE`。
- `wxKill(long pid, wxSignal sig)` → 终止进程（`wxSIGTERM`）。
- `Http::post(url)` → `.header(name,val)` / `.set_post_body(const std::string&)`（`Http.hpp:151`，verbatim）/ `.timeout_connect(s)` / `.timeout_max(s)` / `.on_complete(fn)` / `.on_error(fn)` / `.perform_sync()`（阻塞当前线程）。
- `wxGetApp().sm_get_userinfo()` → `SMUserInfo*`；`->is_user_login()` / `->get_user_token()`。
- `from_u8(std::string)` / `into_u8(wxString)`（`src/slic3r/GUI/GUI.hpp`，字符串转换）。
- `BOOST_LOG_TRIVIAL(info/warning/error)`（日志）。

---

### Task 1: ConnectionSidecar 类骨架 + CMake 注册

**Files:**
- Create: `src/slic3r/GUI/ConnectionSidecar.hpp`
- Create: `src/slic3r/GUI/ConnectionSidecar.cpp`
- Modify: `src/slic3r/CMakeLists.txt`（`SLIC3R_GUI_SOURCES` list，约 `Utils/TimeoutMap.hpp`(:642) 之后、闭合 `)`(:643) 之前）

**Interfaces:**
- Produces: `ConnectionSidecar::get()` / `start()` / `stop()` / `push_token(token, refresh)` / `push_logout()`（后续 task 实现具体逻辑，本 task 只 stub）。

- [ ] **Step 1: 写头文件 `ConnectionSidecar.hpp`**

```cpp
#pragma once
#include <string>
namespace Slic3r { namespace GUI {

class ConnectionSidecar {
public:
    static ConnectionSidecar& get();

    // 拉起 sidecar 子进程；若已登录则补发 token。在 GUI_App::on_init_inner 尾部调用。
    void start();
    // 终止 sidecar 子进程。在 GUI_App::OnExit 调用。
    void stop();

    // 下发完整登录态（登录成功 / token 刷新）。demo: refresh 固定空串。
    void push_token(const std::string& token, const std::string& refresh_token);
    // 下发空 token（登出）。
    void push_logout();

private:
    ConnectionSidecar() = default;
    long m_pid = 0;
    bool m_started = false;

    bool ensureStarted();                                   // 计算路径并 wxExecute
    void doPost(const std::string& token,                   // 实际 POST（JSON + 有限重试，工作线程）
                const std::string& refresh_token);
};

}} // namespace Slic3r::GUI
```

- [ ] **Step 2: 写 stub 实现 `ConnectionSidecar.cpp`**

```cpp
#include "ConnectionSidecar.hpp"
#include <boost/log/trivial.hpp>

namespace Slic3r { namespace GUI {

ConnectionSidecar& ConnectionSidecar::get() {
    static ConnectionSidecar inst;
    return inst;
}
void ConnectionSidecar::start()                        { /* Task 4 */ }
void ConnectionSidecar::stop()                         { /* Task 2 */ }
void ConnectionSidecar::push_token(const std::string&, const std::string&) { /* Task 3 */ }
void ConnectionSidecar::push_logout()                  { /* Task 3 */ }
bool ConnectionSidecar::ensureStarted()                { return false; /* Task 2 */ }
void ConnectionSidecar::doPost(const std::string&, const std::string&)     { /* Task 3 */ }

}} // namespace Slic3r::GUI
```

- [ ] **Step 3: 注册到 CMake**

在 `src/slic3r/CMakeLists.txt` 的 `SLIC3R_GUI_SOURCES` list 末尾（`Utils/TimeoutMap.hpp` 之后、闭合 `)` 之前）加两行：

```cmake
        GUI/ConnectionSidecar.cpp
        GUI/ConnectionSidecar.hpp
```

- [ ] **Step 4: 增量编译验证**

Run: `build_release_vs2022.bat slicer`
Expected: 编译通过，`libslic3r_gui` 包含新文件且无链接错误。

- [ ] **Step 5: Commit**

```bash
git add src/slic3r/GUI/ConnectionSidecar.hpp src/slic3r/GUI/ConnectionSidecar.cpp src/slic3r/CMakeLists.txt
git commit -m "feat: scaffold ConnectionSidecar (stub) and register in CMake"
```

---

### Task 2: 进程生命周期（ensureStarted / stop）

**Files:**
- Modify: `src/slic3r/GUI/ConnectionSidecar.cpp`

**Interfaces:**
- Consumes: `Slic3r::resources_dir()`, `from_u8/into_u8`, `wxExecute`, `wxKill`。
- Produces: `ensureStarted()`（拉起并置 `m_pid/m_started`）、`stop()`（终止）。

- [ ] **Step 1: 补 include**

在 `ConnectionSidecar.cpp` 顶部 include 区追加：

```cpp
#include "GUI.hpp"                 // from_u8 / into_u8
#include <libslic3r/libslic3r.h>   // Slic3r::resources_dir()
#include <wx/process.h>            // wxExecute, wxEXEC_*
#include <wx/utils.h>              // wxKill, wxSIGTERM
```

> 若 `resources_dir()` 在该头未导出，`grep -rn "std::string resources_dir" src/libslic3r` 找确切声明并 include。

- [ ] **Step 2: 实现 `ensureStarted()`**

替换 stub：

```cpp
bool ConnectionSidecar::ensureStarted() {
    if (m_started) return true;
#ifdef _WIN32
    wxString exe = from_u8(Slic3r::resources_dir()) + wxT("/snapmaker_connection.exe");
#else
    // TODO(demo): macOS/Linux —— 二进制名无 .exe 后缀，路径可能是 .app/Contents/Resources
    wxString exe = from_u8(Slic3r::resources_dir()) + wxT("/snapmaker_connection");
#endif
    m_pid = wxExecute(exe, wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE);
    m_started = (m_pid > 0);
    BOOST_LOG_TRIVIAL(info) << "sidecar: spawn " << into_u8(exe) << " -> pid=" << m_pid;
    if (!m_started) {
        BOOST_LOG_TRIVIAL(error) << "sidecar: failed to spawn " << into_u8(exe);
    }
    return m_started;
}
```

- [ ] **Step 3: 实现 `stop()`**

替换 stub：

```cpp
void ConnectionSidecar::stop() {
    if (m_pid > 0) {
        BOOST_LOG_TRIVIAL(info) << "sidecar: stop pid=" << m_pid;
        wxKill(m_pid, wxSIGTERM);
        m_pid = 0;
        m_started = false;
    }
}
```

- [ ] **Step 4: 增量编译验证**

Run: `build_release_vs2022.bat slicer`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/slic3r/GUI/ConnectionSidecar.cpp
git commit -m "feat: spawn/stop sidecar process (Windows)"
```

---

### Task 3: token 下发（doPost / push_token / push_logout）

**Files:**
- Modify: `src/slic3r/GUI/ConnectionSidecar.cpp`

**Interfaces:**
- Consumes: `Http::post` / `set_post_body` / `header` / `on_complete` / `on_error` / `perform_sync`；`nlohmann::json`。
- Produces: `doPost(token, refresh)`（工作线程 + JSON + 连接拒绝重试 ≤5 次）、`push_token` / `push_logout` 转发。

- [ ] **Step 1: 补 include**

```cpp
#include "Utils/Http.hpp"
#include <nlohmann/json.hpp>
#include <thread>
#include <chrono>
```

- [ ] **Step 2: 实现 `doPost`**

替换 stub。POST 跑在 detach 的工作线程（不阻塞 UI）；连接被拒（sidecar 未就绪）时按 1s 退避重试，上限 5 次；成功即跳出。

```cpp
void ConnectionSidecar::doPost(const std::string& token, const std::string& refresh_token) {
    std::string t = token, r = refresh_token;   // 捕获到线程
    std::thread([t = std::move(t), r = std::move(r)]() {
        nlohmann::json body;
        body["token"] = t;
        body["refreshToken"] = r;
        const std::string payload = body.dump();

        constexpr int kMaxRetry = 5;
        for (int attempt = 0; attempt < kMaxRetry; ++attempt) {
            bool ok = false;
            Http::post("http://127.0.0.1:8767/api/updateToken")
                .header("Content-Type", "application/json")
                .set_post_body(payload)
                .timeout_connect(3)
                .timeout_max(5)
                .on_complete([&ok](std::string /*body*/, unsigned /*status*/) { ok = true; })
                .on_error([attempt](std::string /*body*/, std::string err, unsigned status) {
                    BOOST_LOG_TRIVIAL(warning)
                        << "sidecar push failed attempt=" << attempt
                        << " status=" << status << " err=" << err;
                })
                .perform_sync();
            if (ok) {
                BOOST_LOG_TRIVIAL(info) << "sidecar push ok after attempt=" << attempt;
                return;
            }
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
        BOOST_LOG_TRIVIAL(error) << "sidecar push gave up after " << kMaxRetry << " attempts";
    }).detach();
}
```

- [ ] **Step 3: 实现 `push_token` / `push_logout`**

替换 stub：

```cpp
void ConnectionSidecar::push_token(const std::string& token, const std::string& refresh_token) {
    doPost(token, refresh_token);
}
void ConnectionSidecar::push_logout() {
    doPost("", "");
}
```

- [ ] **Step 4: 增量编译验证**

Run: `build_release_vs2022.bat slicer`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/slic3r/GUI/ConnectionSidecar.cpp
git commit -m "feat: push login state to sidecar via POST /api/updateToken"
```

---

### Task 4: start() + 启动补发

**Files:**
- Modify: `src/slic3r/GUI/ConnectionSidecar.cpp`

**Interfaces:**
- Consumes: Task 2 `ensureStarted()`、Task 3 `push_token`；`wxGetApp().sm_get_userinfo()`。
- Produces: `start()`（拉起 + 若已登录补发）。

- [ ] **Step 1: 补 include**

```cpp
#include "GUI_App.hpp"   // wxGetApp / sm_get_userinfo
```

- [ ] **Step 2: 实现 `start()`**

替换 stub：

```cpp
void ConnectionSidecar::start() {
    if (!ensureStarted()) return;
    // 启动补发：若当前已登录，立即把 access token 下发一次（refresh 空，见 Global Constraints）
    auto* info = wxGetApp().sm_get_userinfo();
    if (info && info->is_user_login()) {
        push_token(info->get_user_token(), "");
    }
}
```

- [ ] **Step 3: 增量编译验证**

Run: `build_release_vs2022.bat slicer`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add src/slic3r/GUI/ConnectionSidecar.cpp
git commit -m "feat: start sidecar and replay token if already logged in"
```

---

### Task 5: 挂钩 GUI_App（启动 / 退出 / 登出）

**Files:**
- Modify: `src/slic3r/GUI/GUI_App.cpp`：`on_init_inner` 尾部（`cpp:3088` `profiler.mark("on_init_inner return");` 之后、函数 return 之前）、`OnExit`（`cpp:2469`，`return wxApp::OnExit();` `:2514` 之前）、`sm_request_user_logout`（`cpp:4283`）。

**Interfaces:**
- Consumes: Task 4 `start()`、Task 2 `stop()`、Task 3 `push_logout()`。

- [ ] **Step 1: 补 include**

在 `GUI_App.cpp` include 区追加（若已有则跳过）：

```cpp
#include "ConnectionSidecar.hpp"
```

- [ ] **Step 2: 在 `on_init_inner` 尾部挂钩 `start()`**

定位 `GUI_App::on_init_inner` 末尾 `profiler.mark("on_init_inner return");`（约 `cpp:3088`），在其后、函数 return 之前插入：

```cpp
    profiler.mark("on_init_inner return");

    // ORCA sidecar demo: 拉起 snapmaker_connection.exe，登录态补发
    ConnectionSidecar::get().start();

    return true;
```

> 实际 return 语句以现场为准（保持原返回值/类型不变），只插入 `start()` 调用。

- [ ] **Step 3: 在 `OnExit` 挂钩 `stop()`**

定位 `GUI_App::OnExit`（`cpp:2469`），在 `return wxApp::OnExit();`（`:2514`）之前插入：

```cpp
    ConnectionSidecar::get().stop();
    return wxApp::OnExit();
```

- [ ] **Step 4: 在 `sm_request_user_logout` 挂钩 `push_logout()`**

定位 `GUI_App::sm_request_user_logout`（`cpp:4283`），在函数体开头（`if (m_login_userinfo.is_user_login())` 之前）插入：

```cpp
void GUI_App::sm_request_user_logout()
{
    ConnectionSidecar::get().push_logout();   // ORCA sidecar demo: 下发空 token
    if (m_login_userinfo.is_user_login()) {
        m_login_userinfo.set_user_login(false);
    }
    // ... 原逻辑保持不变
```

- [ ] **Step 5: 增量编译验证**

Run: `build_release_vs2022.bat slicer`
Expected: 编译通过。

- [ ] **Step 6: Commit**

```bash
git add src/slic3r/GUI/GUI_App.cpp
git commit -m "feat: wire sidecar start/stop/logout into GUI_App lifecycle"
```

---

### Task 6: 挂钩登录成功（push_token）

**Files:**
- Modify: `src/slic3r/GUI/WebSMUserLoginDialog.cpp:222-223`（`set_user_token(token)` 之后）。

**Interfaces:**
- Consumes: Task 3 `push_token(token, refresh)`。

- [ ] **Step 1: 补 include**

在 `WebSMUserLoginDialog.cpp` include 区追加（若已有则跳过）：

```cpp
#include "ConnectionSidecar.hpp"
```

- [ ] **Step 2: 在登录成功处挂钩 `push_token`**

定位 `WebSMUserLoginDialog.cpp:222`（`set_user_token(token);` 之后是 `set_user_login(true);` :223），在 `set_user_login(true);` 之后插入：

```cpp
                        wxGetApp().sm_get_userinfo()->set_user_token(token);
                        wxGetApp().sm_get_userinfo()->set_user_login(true);
                        // ORCA sidecar demo: 下发登录态（refresh 空，见 plan Global Constraints）
                        ConnectionSidecar::get().push_token(token, "");
```

> 仅 web 登录这一条主路径挂钩。原生 OAuth 对话框（`OAuthDialog.cpp`）非主路径，demo 不挂。

- [ ] **Step 3: 增量编译验证**

Run: `build_release_vs2022.bat slicer`
Expected: 编译通过，产出可运行的 Orca 可执行文件。

- [ ] **Step 4: Commit**

```bash
git add src/slic3r/GUI/WebSMUserLoginDialog.cpp
git commit -m "feat: push token to sidecar on web login success"
```

---

### Task 7: 构建确认 + 手动验收

**Files:** 无（验证任务）。

- [ ] **Step 1: 完整 Release 构建**

Run: `build_release_vs2022.bat slicer`
Expected: 全量编译通过，产出 `build/src/.../snapmaker-orca.exe`（或对应输出路径）。

- [ ] **Step 2: 放置 sidecar 可执行文件**

确认 `resources/snapmaker_connection.exe` 存在（由 Flutter 侧产出；端口 8767 已改）。若缺失，向 Flutter 侧确认产出，不放占位。

- [ ] **Step 3: 对照 spec §10 验收清单手动验证**

逐条核验（Orca 启动 → 任务管理器看 `snapmaker_connection.exe` → 登录 → 看日志 `sidecar push ok` → 登出 → 看 sidecar 收空 token → 退出 → 看子进程消失 → sidecar 未就绪时不崩不卡 UI）：

1. 启动 Orca → 任务管理器可见 `snapmaker_connection.exe`；日志 `sidecar: spawn ... -> pid=...`。
2. 完成登录 → 日志 `sidecar push ok`；sidecar 侧确认收到 `{"token":..,"refreshToken":""}`（token 非空）。
3. 登出 → sidecar 侧确认收到 `{"token":"","refreshToken":""}`。
4. 重启 Orca 保持登录态 → 启动后自动 `sidecar push ok`（启动补发）。
5. 退出 Orca → `snapmaker_connection.exe` 子进程随之结束（日志 `sidecar: stop pid=...`）。
6. 临时停掉 sidecar 再启动 Orca → 不崩溃、不卡 UI，日志见 `sidecar push failed ... gave up` 的 warning/error。

- [ ] **Step 4: 验收通过后（可选）打 tag**

```bash
git tag sidecar-demo-v0
```

> 不 push。验收若发现缺陷，回到对应 Task 修复并 commit。

---

## Self-Review 结果

- **Spec 覆盖**：spec §4 组件设计 → Task 1；§5 挂钩点（启动/退出/登录/登出）→ Task 5/6；§6.1 进程拉起 → Task 2；§6.2 JSON 下发 → Task 3；§6.3 就绪重试 → Task 3 的 5 次重试；§6.4 登出 → Task 3 `push_logout` + Task 5 挂钩；§7 文件清单 → 各 Task Files；§10 验收 → Task 7。spec §8 四个待确认项已在 plan 前言/Global Constraints 落实（refresh 空、OnExit、WebSMUserLoginDialog:222、CMake list）。✅
- **占位扫描**：stub 里的 `/* Task N */` 是有意的渐进实现标记（后续 Task 替换为真实代码），非交付占位；跨平台 `TODO(demo)` 已在 Global Constraints 声明。无「TBD/适当处理/类似 Task N」。✅
- **类型一致性**：`start/stop/push_token/push_logout/ensureStarted/doPost` 在 hpp 声明与各 cpp Task 实现签名一致；`push_token(const std::string&, const std::string&)` 全程一致。✅
