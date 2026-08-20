use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeEngineKey {
    Release { version: String },
    Preview { fingerprint: String },
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeEngineReady {
    pub port: u16,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeEngineProgress {
    pub phase: NativeEngineProgressPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeEngineProgressPhase {
    Resolving,
    DownloadingBinary,
    Verifying,
    DownloadingData,
    Spawning,
    Ready,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NativeEngineError {
    InvalidKey { detail: String },
    #[allow(dead_code)]
    UnsupportedPlatform { detail: String },
    Download { detail: String },
    Verification { detail: String },
    Manifest { detail: String },
    Downgrade { detail: String },
    Storage { detail: String },
    Spawn { detail: String },
    Health { detail: String },
    Internal { detail: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BridgeEvent {
    Message { text: String },
    Closed { code: u16, reason: String },
    Error { detail: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NativeEngineBridgeError {
    NotRunning { detail: String },
    #[allow(dead_code)]
    UnsupportedPlatform { detail: String },
    Connect { detail: String },
    UnknownBridge { detail: String },
    Send { detail: String },
    Internal { detail: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_contract_preserves_tagged_json_shapes() {
        assert_eq!(
            serde_json::to_string(&NativeEngineKey::Release {
                version: "1.2.3".to_owned(),
            })
            .unwrap(),
            r#"{"release":{"version":"1.2.3"}}"#
        );
        assert_eq!(
            serde_json::to_string(&NativeEngineError::UnsupportedPlatform {
                detail: "Android".to_owned(),
            })
            .unwrap(),
            r#"{"kind":"unsupported_platform","detail":"Android"}"#
        );
        assert_eq!(
            serde_json::to_string(&NativeEngineBridgeError::UnsupportedPlatform {
                detail: "Android".to_owned(),
            })
            .unwrap(),
            r#"{"kind":"unsupported_platform","detail":"Android"}"#
        );
    }
}
