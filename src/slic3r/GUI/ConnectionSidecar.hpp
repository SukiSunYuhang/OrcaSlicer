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
