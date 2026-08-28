#include "ConnectionSidecar.hpp"
#include "GUI_App.hpp"
#include "GUI.hpp"                 // from_u8 / into_u8
#include "../Utils/Http.hpp"
#include "libslic3r/Utils.hpp"      // Slic3r::resources_dir() / data_dir()
#include "nlohmann/json.hpp"
#include <boost/log/trivial.hpp>
#include <boost/filesystem.hpp>
#include <wx/process.h>            // wxProcess, wxExecute, wxEXEC_*
#include <wx/utils.h>              // wxKill, wxSIGTERM
#include <thread>
#include <chrono>
#include <vector>

namespace Slic3r { namespace GUI {

namespace {
// cli 退出码 2 = 端口被已有实例占用（单例锁）→ 复用已有实例
constexpr int kExitPortBusy = 2;
} // namespace

// 捕获子进程退出码。OnTerminate 在进程终止时由 wx 主循环回调（主线程），
// 退出码写回单例持有的原子变量，供健康探测线程判断“复用 / 失败”。
class SidecarProcess : public wxProcess {
public:
    explicit SidecarProcess(std::atomic<bool>& exited, std::atomic<int>& code)
        : m_exited(exited), m_code(code) {}
    void OnTerminate(int pid, int status) override {
        m_code   = status;
        m_exited = true;
    }
private:
    std::atomic<bool>& m_exited;
    std::atomic<int>&  m_code;
};

ConnectionSidecar& ConnectionSidecar::get() {
    static ConnectionSidecar inst;
    return inst;
}

void ConnectionSidecar::start() {
    if (m_started) return;
    m_started = true;

    // 在主线程先取登录态，避免工作线程碰 wxGetApp
    bool        logged_in = false;
    std::string token;
    auto* info = wxGetApp().sm_get_userinfo();
    if (info && info->is_user_login()) {
        token     = info->get_user_token();
        logged_in = true;
    }

    if (!ensureStarted()) return;

    // 后台等待 /health 就绪；就绪后若已登录补发一次 token（refresh 空，见 plan Global Constraints）
    std::thread([this, logged_in, t = std::move(token)]() {
        if (!wait_ready(30)) return;
        if (logged_in) push_token(t, "");
    }).detach();
}

void ConnectionSidecar::stop() {
    const long pid = m_pid.exchange(0);
    // 只终止自己拉起且仍在运行的子进程；复用的已有实例（退出码 2）不归本进程管
    if (pid > 0 && m_spawned.load() && !m_exited.load()) {
        BOOST_LOG_TRIVIAL(info) << "sidecar: stop pid=" << pid;
        wxKill(pid, wxSIGTERM);
    }
    m_spawned = false;
}

void ConnectionSidecar::push_token(const std::string& token, const std::string& refresh_token) {
    doPost(token, refresh_token);
}

void ConnectionSidecar::push_logout() {
    doPost("", "");
}

std::string ConnectionSidecar::base_url() const {
    const int port = m_port.load();
    return "http://127.0.0.1:" + std::to_string(port > 0 ? port : kDefaultPort);
}

bool ConnectionSidecar::wait_ready(int timeout_seconds) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(timeout_seconds);
    bool reuse_logged = false;

    while (std::chrono::steady_clock::now() < deadline) {
        // 子进程已退出：码 2 = 端口被占 → 复用已有实例，继续探测；其它码 = 拉起失败，放弃
        if (m_exited.load()) {
            const int code = m_exit_code.load();
            if (code == kExitPortBusy) {
                if (!reuse_logged) {
                    reuse_logged = true;
                    m_spawned = false;   // 已有实例不归本进程管，退出时不能 kill
                    m_pid    = 0;
                    BOOST_LOG_TRIVIAL(info) << "sidecar: port busy (exit code 2), reuse existing instance";
                }
            } else {
                BOOST_LOG_TRIVIAL(error) << "sidecar: process exited unexpectedly, code=" << code;
                return false;
            }
        }

        bool ok = false;
        std::string body;
        Http::get(base_url() + "/health")
            .timeout_connect(2)
            .timeout_max(3)
            .on_complete([&](std::string resp, unsigned status) {
                if (status == 200) { body = std::move(resp); ok = true; }
            })
            .on_error([](std::string /*body*/, std::string /*err*/, unsigned /*status*/) {})
            .perform_sync();
        if (ok) {
            try {
                auto j = nlohmann::json::parse(body);
                if (j.value("ok", false)) {
                    // ★ 端口取自 /health 返回值，后续请求全部走它
                    const int port = j.value("port", kDefaultPort);
                    m_port = port;
                    BOOST_LOG_TRIVIAL(info)
                        << "sidecar: ready port=" << port
                        << " version=" << j.value("version", std::string())
                        << " service_available=" << j.value("service_available", false);
                    return true;
                }
            } catch (const std::exception& e) {
                BOOST_LOG_TRIVIAL(warning) << "sidecar: bad /health response: " << e.what();
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
    BOOST_LOG_TRIVIAL(error) << "sidecar: health check timed out after " << timeout_seconds << "s";
    return false;
}

bool ConnectionSidecar::ensureStarted() {
#ifdef _WIN32
    wxString exe = from_u8(Slic3r::resources_dir()) + wxT("/snapmaker_connection.exe");
#else
    // TODO(demo): macOS/Linux —— 二进制名无 .exe 后缀，路径可能是 .app/Contents/Resources
    wxString exe = from_u8(Slic3r::resources_dir()) + wxT("/snapmaker_connection");
#endif
    // --web-root：flutter web 根目录。优先 data 目录副本（GUI_App 启动时已同步/升级），
    // 缺失时退回 resources 内置副本。保持 UTF-8 字符串拼接，避免编码往返。
    std::string web_root = Slic3r::data_dir() + "/web/flutter_web";
    if (!boost::filesystem::exists(boost::filesystem::path(web_root)))
        web_root = Slic3r::resources_dir() + "/web/flutter_web";
    // --data-dir：cli 的数据/缓存目录，与 Orca 数据目录一致
    const std::string data_dir = Slic3r::data_dir();
    // --locale：语言-地区（如 en-US / zh-CN / de-DE）
    // 语言取 Orca language（zh_CN→zh，其余取前缀），地区取 country_code
    std::string lang     = wxGetApp().app_config->get("language");
    std::string region   = wxGetApp().app_config->get_country_code();
    std::string lang_pre = (lang == "zh_CN") ? "zh" : (lang.empty() ? "en" : lang.substr(0, 2));
    if (region.empty()) region = "US";
    std::string locale   = lang_pre + "-" + region;

    auto* proc = new SidecarProcess(m_exited, m_exit_code);
#ifdef _WIN32
    // 注意：argv 里的指针必须指向存活的 wxString（具名局部变量），不能指向临时对象
    const wxString web_root_arg = from_u8(web_root);
    const wxString data_dir_arg = from_u8(data_dir);
    const wxString locale_arg   = wxString::FromUTF8("--locale=" + locale);
    std::vector<const wchar_t*> args;
    args.emplace_back(exe.wc_str());
    args.emplace_back(L"--web-root");
    args.emplace_back(web_root_arg.wc_str());
    args.emplace_back(L"--data-dir");
    args.emplace_back(data_dir_arg.wc_str());
    args.emplace_back(locale_arg.wc_str());
    args.emplace_back(nullptr);
    m_pid = wxExecute(args.data(), wxEXEC_ASYNC | wxEXEC_HIDE_CONSOLE, proc);
#else
    wxString cmd = exe;
    cmd << wxT(" --web-root \"") << from_u8(web_root)
        << wxT("\" --data-dir \"") << from_u8(data_dir)
        << wxT("\" --locale=") << from_u8(locale);
    m_pid = wxExecute(cmd, wxEXEC_ASYNC, proc);
#endif
    const bool spawned = m_pid.load() > 0;
    if (!spawned) {
        delete proc;   // wxExecute 未接管所有权时由调用方释放
        BOOST_LOG_TRIVIAL(error) << "sidecar: failed to spawn " << into_u8(exe);
        return false;
    }
    m_spawned = true;
    BOOST_LOG_TRIVIAL(info)
        << "sidecar: spawn " << into_u8(exe)
        << " --web-root=" << web_root
        << " --data-dir=" << data_dir
        << " --locale=" << locale
        << " -> pid=" << m_pid.load();
    return true;
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
            Http::post(ConnectionSidecar::get().base_url() + "/api/updateToken")
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
