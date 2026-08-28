#pragma once
#include <string>
#include <atomic>
namespace Slic3r { namespace GUI {

// 拉起 dart cli（snapmaker_connection.exe）子进程并跟踪其 HTTP 服务。
// 时序契约（device_cmd API 文档 §4）：
//   1. spawn cli --web-root … --data-dir … --locale=xx-XX
//   2. 轮询 GET /health 到 {"ok":true}；**端口取自 /health 返回值的 "port" 字段**
//   3. 端口被已有实例占用时 cli 以退出码 2 退出 → 复用已有实例（不 kill、不视为失败）
class ConnectionSidecar {
public:
    static ConnectionSidecar& get();

    // 拉起 cli 子进程并后台等待就绪；若已登录则就绪后补发 token。在 GUI_App::on_init_inner 尾部调用。
    void start();
    // 终止自己拉起的 cli 子进程；复用的已有实例不动。在 GUI_App::OnExit 调用。
    void stop();

    // 下发完整登录态（登录成功 / token 刷新）。demo: refresh 固定空串。
    void push_token(const std::string& token, const std::string& refresh_token);
    // 下发空 token（登出）。
    void push_logout();

    // HTTP base（http://127.0.0.1:<port>）。端口来自 /health 返回值；未就绪时退回默认端口。
    std::string base_url() const;
    // 轮询 /health 直到 ok:true（端口从返回值取）。timeout_seconds 内未就绪返回 false。阻塞，勿在 UI 线程调。
    bool wait_ready(int timeout_seconds);

    // /health 探测端口；后续请求的真实端口以 /health 返回值为准
    static constexpr int kDefaultPort = 8767;

private:
    ConnectionSidecar() = default;

    bool m_started = false;                 // start() 是否已执行过（仅主线程）

    std::atomic<long> m_pid{0};             // 拉起的子进程 pid；0 = 无
    std::atomic<bool> m_spawned{false};     // 是否仍持有自己拉起的活子进程（退出码 2 复用时清零）
    std::atomic<int>  m_port{0};            // /health 返回的端口；0 = 未就绪
    std::atomic<bool> m_exited{false};      // 子进程是否已退出
    std::atomic<int>  m_exit_code{0};       // 子进程退出码（m_exited 为 true 时有效）

    bool ensureStarted();                                   // 计算路径/参数并 wxExecute
    void doPost(const std::string& token,                   // 实际 POST（JSON + 有限重试，工作线程）
                const std::string& refresh_token);
};

}} // namespace Slic3r::GUI
