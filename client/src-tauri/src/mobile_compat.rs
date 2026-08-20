#![cfg_attr(not(mobile), allow(dead_code))]

use tauri::ipc::Channel;

use crate::native_engine_contract::{
    BridgeEvent, NativeEngineBridgeError, NativeEngineError, NativeEngineKey, NativeEngineProgress,
    NativeEngineReady,
};

const UNSUPPORTED_DETAIL: &str = "native engine is not available on mobile";

#[cfg_attr(mobile, tauri::command)]
pub async fn ensure_native_engine(
    _key: NativeEngineKey,
) -> Result<NativeEngineReady, NativeEngineError> {
    Err(NativeEngineError::UnsupportedPlatform {
        detail: UNSUPPORTED_DETAIL.to_owned(),
    })
}

#[cfg_attr(mobile, tauri::command)]
pub fn native_engine_progress() -> Option<NativeEngineProgress> {
    None
}

#[cfg_attr(mobile, tauri::command)]
pub async fn stop_native_engine() -> Result<(), NativeEngineError> {
    Ok(())
}

#[cfg_attr(mobile, tauri::command)]
pub async fn connect_native_engine(
    _on_event: Channel<BridgeEvent>,
) -> Result<u64, NativeEngineBridgeError> {
    Err(NativeEngineBridgeError::UnsupportedPlatform {
        detail: UNSUPPORTED_DETAIL.to_owned(),
    })
}

#[cfg_attr(mobile, tauri::command)]
pub fn native_engine_bridge_send(_id: u64, _text: String) -> Result<(), NativeEngineBridgeError> {
    Err(NativeEngineBridgeError::UnsupportedPlatform {
        detail: UNSUPPORTED_DETAIL.to_owned(),
    })
}

#[cfg_attr(mobile, tauri::command)]
pub fn native_engine_bridge_close(_id: u64) -> Result<(), NativeEngineBridgeError> {
    Err(NativeEngineBridgeError::UnsupportedPlatform {
        detail: UNSUPPORTED_DETAIL.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_unsupported<T: serde::Serialize>(error: T) {
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "kind": "unsupported_platform",
                "detail": UNSUPPORTED_DETAIL,
            })
        );
    }

    #[test]
    fn every_mobile_compat_command_is_side_effect_free_and_stable() {
        let hostile_but_valid = NativeEngineKey::Release {
            version: "999.999.999".to_owned(),
        };
        assert_unsupported(
            tauri::async_runtime::block_on(ensure_native_engine(hostile_but_valid)).unwrap_err(),
        );
        assert!(native_engine_progress().is_none());
        assert!(tauri::async_runtime::block_on(stop_native_engine()).is_ok());
        assert_unsupported(
            tauri::async_runtime::block_on(connect_native_engine(Channel::new(|_| Ok(()))))
                .unwrap_err(),
        );
        assert_unsupported(
            native_engine_bridge_send(u64::MAX, "hostile text".to_owned()).unwrap_err(),
        );
        assert_unsupported(native_engine_bridge_close(u64::MAX).unwrap_err());
    }
}
