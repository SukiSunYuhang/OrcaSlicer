#include "ConnectionSidecar.hpp"
#include "GUI_App.hpp"
#include "GUI.hpp"                 // from_u8 / into_u8
#include "../Utils/Http.hpp"
#include "libslic3r/Utils.hpp"      // Slic3r::resources_dir()
#include "nlohmann/json.hpp"
#include <boost/log/trivial.hpp>
#include <wx/process.h>            // wxExecute, wxEXEC_*
#include <wx/utils.h>              // wxKill, wxSIGTERM
#include <thread>
#include <chrono>
#include <vector>

namespace Slic3r { namespace GUI {

ConnectionSidecar& ConnectionSidecar::get() {
    static ConnectionSidecar inst;
    return inst;
}

void ConnectionSidecar::start() {
    if (!ensureStarted()) return;
    // 启动补发：若当前已登录，立即把 access token 下发一次（refresh 空，见 plan Global Constraints）
    auto* info = wxGetApp().sm_get_userinfo();
    if (info && info->is_user_login()) {
        push_token(info->get_user_token(), "");
    }
}

void ConnectionSidecar::stop() {
    if (m_pid > 0) {
        BOOST_LOG_TRIVIAL(info) << "sidecar: stop pid=" << m_pid;
        wxKill(m_pid, wxSIGTERM);
        m_pid = 0;
        m_started = false;
    }
}

void ConnectionSidecar::push_token(const std::string& token, const std::string& refresh_token) {
    doPost(token, refresh_token);
}

void ConnectionSidecar::push_logout() {
    doPost("", "");
}

bool ConnectionSidecar::ensureStarted() {
    if (m_started) return true;
#ifdef _WIN32
    wxString exe = from_u8(Slic3r::resources_dir()) + wxT("/snapmaker_connection.exe");
#else
    // TODO(demo): macOS/Linux —— 二进制名无 .exe 后缀，路径可能是 .app/Contents/Resources
    wxString exe = from_u8(Slic3r::resources_dir()) + wxT("/snapmaker_connection");
#endif
    // sidecar 语言参数：中文 zh-CN，其余 en-US
    std::string local = (wxGetApp().app_config->get("language") == "zh_CN") ? "zh-CN" : "en-US";
    wxString    arg   = wxString::FromUTF8("--local=" + local);

#ifdef _WIN32
    std::vector<const wchar_t*> args;
    args.emplace_back(exe.wc_str());
    args.emplace_back(arg.wc_str());
    args.emplace_back(nullptr);
    m_pid = wxExecute(const_cast<wchar_t**>(args.data()), wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE);
#else
    m_pid = wxExecute(exe + wxT(" ") + arg, wxEXEC_ASYNC);
#endif
    m_started = (m_pid > 0);
    BOOST_LOG_TRIVIAL(info) << "sidecar: spawn " << into_u8(exe) << " --local=" << local << " -> pid=" << m_pid;
    if (!m_started) {
        BOOST_LOG_TRIVIAL(error) << "sidecar: failed to spawn " << into_u8(exe);
    }
    return m_started;
}

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

}} // namespace Slic3r::GUI
