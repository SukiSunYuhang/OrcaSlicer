#include "ConnectionSidecar.hpp"
#include "GUI.hpp"                 // from_u8 / into_u8
#include <libslic3r/libslic3r.h>   // Slic3r::resources_dir()
#include <boost/log/trivial.hpp>
#include <wx/process.h>            // wxExecute, wxEXEC_*
#include <wx/utils.h>              // wxKill, wxSIGTERM

namespace Slic3r { namespace GUI {

ConnectionSidecar& ConnectionSidecar::get() {
    static ConnectionSidecar inst;
    return inst;
}

void ConnectionSidecar::start() { /* Task 4 */ }

void ConnectionSidecar::stop() {
    if (m_pid > 0) {
        BOOST_LOG_TRIVIAL(info) << "sidecar: stop pid=" << m_pid;
        wxKill(m_pid, wxSIGTERM);
        m_pid = 0;
        m_started = false;
    }
}

void ConnectionSidecar::push_token(const std::string&, const std::string&) { /* Task 3 */ }
void ConnectionSidecar::push_logout() { /* Task 3 */ }

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

void ConnectionSidecar::doPost(const std::string&, const std::string&) { /* Task 3 */ }

}} // namespace Slic3r::GUI
