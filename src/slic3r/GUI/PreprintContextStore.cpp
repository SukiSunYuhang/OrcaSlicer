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
    body["id"]          = id;
    body["payload"]     = payload;
    body["ttl_seconds"] = ttl_seconds;
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
