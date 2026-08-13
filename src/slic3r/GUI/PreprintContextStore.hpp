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
