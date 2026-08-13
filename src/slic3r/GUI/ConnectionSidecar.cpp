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
