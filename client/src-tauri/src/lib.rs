#[cfg(desktop)]
use tauri::{Manager, WebviewWindowBuilder};

mod audio_probe;
mod host_platform;
mod migration;
mod mobile_compat;
#[cfg(desktop)]
mod native_bridge;
#[cfg(desktop)]
mod native_engine;
mod native_engine_contract;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's dmabuf renderer renders blank frames when the GPU import
    // path misbehaves (NVIDIA drivers); forcing shared-memory buffers avoids
    // that while keeping the dmabuf renderer (and thus acceleration), unlike
    // WEBKIT_DISABLE_DMABUF_RENDERER which tanks in-game performance. Must be
    // set before the first webview is created. A value already present in the
    // environment wins so users can override.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
        std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
    }

    let builder = tauri::Builder::default().plugin(
        tauri_plugin_opener::Builder::new()
            .open_js_links_on_click(false)
            .build(),
    );

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            audio_probe::audio_boot_health,
            host_platform::host_platform,
            migration::stash_legacy_storage,
            migration::set_channel_preference,
            migration::take_legacy_storage,
            migration::confirm_legacy_import,
            migration::mark_remote_load_ok,
            native_engine::ensure_native_engine,
            native_engine::native_engine_progress,
            native_engine::stop_native_engine,
            native_bridge::connect_native_engine,
            native_bridge::native_engine_bridge_send,
            native_bridge::native_engine_bridge_close
        ]);

    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        audio_probe::audio_boot_health,
        host_platform::host_platform,
        migration::stash_legacy_storage,
        migration::set_channel_preference,
        migration::take_legacy_storage,
        migration::confirm_legacy_import,
        migration::mark_remote_load_ok,
        mobile_compat::ensure_native_engine,
        mobile_compat::native_engine_progress,
        mobile_compat::stop_native_engine,
        mobile_compat::connect_native_engine,
        mobile_compat::native_engine_bridge_send,
        mobile_compat::native_engine_bridge_close
    ]);

    let app = builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Kick off the audio-device probe before the webview exists so the
                // verdict is usually cached by the time the page asks for it.
                audio_probe::prewarm();
                // `create: false` on the "main" window in tauri.conf.json defers
                // window creation to here so we can pin an explicit, always-writable
                // `data_directory` on Windows. WebView2 otherwise derives its
                // user-data folder from the install path; on a read-only per-machine
                // install (e.g. under Program Files) that folder can't be written, so
                // WebView2 falls back to a throwaway profile that's discarded every
                // launch and the Supabase session in localStorage never survives a
                // restart even though `persistSession: true` is set. Pinning it to the
                // per-user local-data dir keeps it stable and writable regardless of
                // install location.
                //
                // Windows-only: WKWebView (macOS) ignores `data_directory`, and
                // webkit2gtk (Linux) already persists under the user's profile by
                // default — overriding it there would only relocate existing storage
                // and force a one-time re-login, so we leave those platforms on their
                // defaults and just build the window straight from config.
                let main_config = &app.config().app.windows[0];
                let builder =
                    WebviewWindowBuilder::from_config(app, main_config)?.on_navigation(|_| {
                        native_engine::abort_native_engine_bridges_on_navigation();
                        true
                    });
                #[cfg(target_os = "windows")]
                let builder = {
                    let data_dir = app.path().app_local_data_dir()?.join("webview");
                    builder.data_directory(data_dir)
                };
                builder.build()?;
            }
            #[cfg(mobile)]
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running phase.rs");
    app.run(|app, event| {
        #[cfg(desktop)]
        if let tauri::RunEvent::Exit = event {
            native_engine::stop_native_engine_on_exit(app);
        }
        #[cfg(mobile)]
        let _ = (app, event);
    });
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, fs, path::Path};

    use serde_json::{json, Value};
    use tauri::utils::{config::parse::read_from, platform::Target};

    fn android_overlay_value() -> Value {
        serde_json::from_str(include_str!("../tauri.android.conf.json")).unwrap()
    }

    fn expected_android_overlay() -> Value {
        json!({
            "app": {
                "windows": [{
                    "label": "main",
                    "title": "phase.rs",
                    "create": true,
                    "resizable": true,
                    "maximized": true
                }]
            },
            "bundle": {
                "createUpdaterArtifacts": false,
                "android": {
                    "minSdkVersion": 24,
                    "debugApplicationIdSuffix": ".debug",
                    "autoIncrementVersionCode": false
                }
            }
        })
    }

    fn verify_android_config(root: &Path) -> Result<(), String> {
        let base: Value = serde_json::from_str(
            &fs::read_to_string(root.join("tauri.conf.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let overlay: Value = serde_json::from_str(
            &fs::read_to_string(root.join("tauri.android.conf.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if overlay != expected_android_overlay() {
            return Err("overlay differs from the exact reviewed merge patch".into());
        }
        let (merged, paths) = read_from(Target::Android, root).map_err(|e| e.to_string())?;
        if paths.len() != 2
            || paths[0].file_name().and_then(|name| name.to_str()) != Some("tauri.conf.json")
            || paths[1].file_name().and_then(|name| name.to_str())
                != Some("tauri.android.conf.json")
        {
            return Err("Tauri did not consume exactly the base and Android overlay".into());
        }
        let config: tauri::Config =
            serde_json::from_value(merged.clone()).map_err(|e| e.to_string())?;
        if config.product_name.as_deref() != base["productName"].as_str()
            || config.version.as_deref() != base["version"].as_str()
            || config.identifier != base["identifier"].as_str().unwrap()
        {
            return Err("base product/version/identifier authority was not inherited".into());
        }
        if merged["build"]
            != serde_json::from_str::<Value>(include_str!("../tauri.conf.json")).unwrap()["build"]
            || merged["plugins"]
                != serde_json::from_str::<Value>(include_str!("../tauri.conf.json")).unwrap()
                    ["plugins"]
        {
            return Err("base build/plugin authority changed during merge".into());
        }
        if !config.bundle.active
            || merged["bundle"]["targets"] != "all"
            || merged["bundle"]["icon"]
                != serde_json::from_str::<Value>(include_str!("../tauri.conf.json")).unwrap()
                    ["bundle"]["icon"]
            || config.bundle.create_updater_artifacts != tauri::utils::config::Updater::Bool(false)
        {
            return Err("effective common bundle settings are not exact".into());
        }
        let android = &config.bundle.android;
        if android.min_sdk_version != 24
            || android.version_code.is_some()
            || android.auto_increment_version_code
            || android.debug_application_id_suffix.as_deref() != Some(".debug")
        {
            return Err("effective Android bundle settings are not exact".into());
        }
        if config.app.windows.len() != 1 {
            return Err("Android window array did not replace the desktop array".into());
        }
        let window = &config.app.windows[0];
        if window.label != "main"
            || !window.create
            || window.title != "phase.rs"
            || window.width != 800.0
            || window.height != 600.0
            || !window.resizable
            || !window.maximized
        {
            return Err("effective Android main-window settings are not exact".into());
        }
        Ok(())
    }

    /// `run()` indexes `app.config().app.windows[0]` and assumes it is the
    /// "main" window with `create: false`, so the setup hook is the sole
    /// place that creates it (with the `data_directory` override applied).
    /// If `tauri.conf.json` ever grows a second window or flips `create`
    /// back to `true`, that assumption breaks silently — either panicking on
    /// the index or duplicating the window with two competing webview data
    /// directories. Pin the config shape here so a drift fails loudly.
    #[test]
    fn desktop_config_is_typed_and_preserves_the_base_authority() {
        let raw = include_str!("../tauri.conf.json");
        let config: tauri::Config = serde_json::from_str(raw).unwrap();
        assert_eq!(config.identifier, "rs.phase.app");
        assert_eq!(config.version.as_deref(), Some("0.60.0"));
        assert_eq!(
            config.bundle.create_updater_artifacts,
            tauri::utils::config::Updater::Bool(true)
        );
        assert_eq!(config.bundle.android.version_code, None);
        assert_eq!(config.app.windows.len(), 1);
        let window = &config.app.windows[0];
        assert_eq!(window.label, "main");
        assert!(!window.create);
        assert_eq!(window.width, 1280.0);
        assert_eq!(window.height, 800.0);
        assert!(window.resizable);
        assert!(window.maximized);
    }

    #[test]
    fn android_config_uses_tauri_rfc7396_merge_and_exact_typed_values() {
        assert_eq!(android_overlay_value(), expected_android_overlay());
        verify_android_config(Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap();
    }

    #[test]
    fn installed_android_config_schema_admits_only_the_four_real_properties() {
        let schema_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../node_modules/@tauri-apps/cli/config.schema.json");
        let raw = fs::read_to_string(&schema_path).unwrap_or_else(|error| {
            panic!(
                "failed to read installed Tauri config schema at {}; run the frontend dependency install first: {error}",
                schema_path.display()
            )
        });
        let schema: Value = serde_json::from_str(&raw).unwrap();
        let android = &schema["definitions"]["AndroidConfig"];
        let properties = android["properties"].as_object().unwrap();
        let actual: BTreeSet<_> = properties.keys().map(String::as_str).collect();
        let expected = BTreeSet::from([
            "autoIncrementVersionCode",
            "debugApplicationIdSuffix",
            "minSdkVersion",
            "versionCode",
        ]);
        assert_eq!(actual, expected);
        assert_eq!(properties["minSdkVersion"]["default"], 24);
        assert_eq!(properties["autoIncrementVersionCode"]["default"], false);
        assert!(!properties.contains_key("targetSdkVersion"));
        let overlay = android_overlay_value();
        for key in overlay["bundle"]["android"].as_object().unwrap().keys() {
            assert!(
                properties.contains_key(key),
                "unknown Android overlay key {key}"
            );
        }
        assert!(overlay.get("identifier").is_none());
        assert!(overlay.get("version").is_none());
        assert!(overlay["bundle"]["android"].get("versionCode").is_none());
        assert!(overlay["bundle"]["android"]
            .get("targetSdkVersion")
            .is_none());
    }

    #[test]
    fn every_android_config_mutation_is_rejected_and_the_positive_is_restored() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let base = include_str!("../tauri.conf.json");
        let mut cases: Vec<(&str, Box<dyn Fn(&mut Value)>)> = vec![
            (
                "delete createUpdaterArtifacts",
                Box::new(|v| {
                    v["bundle"]
                        .as_object_mut()
                        .unwrap()
                        .remove("createUpdaterArtifacts");
                }),
            ),
            (
                "change minSdkVersion",
                Box::new(|v| v["bundle"]["android"]["minSdkVersion"] = json!(23)),
            ),
            (
                "change debug suffix",
                Box::new(|v| v["bundle"]["android"]["debugApplicationIdSuffix"] = json!(".other")),
            ),
            (
                "enable auto increment",
                Box::new(|v| v["bundle"]["android"]["autoIncrementVersionCode"] = json!(true)),
            ),
            (
                "append desktop window",
                Box::new(|v| {
                    v["app"]["windows"]
                        .as_array_mut()
                        .unwrap()
                        .push(json!({"label":"second"}))
                }),
            ),
            (
                "duplicate identifier",
                Box::new(|v| v["identifier"] = json!("rs.phase.app")),
            ),
            (
                "duplicate version",
                Box::new(|v| v["version"] = json!("0.60.0")),
            ),
            (
                "duplicate versionCode",
                Box::new(|v| v["bundle"]["android"]["versionCode"] = json!(60000)),
            ),
            (
                "invent targetSdkVersion",
                Box::new(|v| v["bundle"]["android"]["targetSdkVersion"] = json!(36)),
            ),
        ];
        for (index, (name, mutate)) in cases.drain(..).enumerate() {
            let temp = std::env::temp_dir().join(format!(
                "phase-android-config-{}-{index}",
                std::process::id()
            ));
            if temp.exists() {
                fs::remove_dir_all(&temp).unwrap();
            }
            fs::create_dir_all(&temp).unwrap();
            fs::write(temp.join("tauri.conf.json"), base).unwrap();
            let mut overlay = expected_android_overlay();
            mutate(&mut overlay);
            fs::write(
                temp.join("tauri.android.conf.json"),
                serde_json::to_vec_pretty(&overlay).unwrap(),
            )
            .unwrap();
            assert!(
                verify_android_config(&temp).is_err(),
                "mutation unexpectedly passed: {name}"
            );
            fs::remove_dir_all(&temp).unwrap();
            verify_android_config(root).unwrap();
        }
    }

    fn capability_permissions(capability: &Value) -> BTreeSet<&str> {
        capability["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .or_else(|| value["identifier"].as_str())
                    .unwrap()
            })
            .collect()
    }

    fn resolve_capabilities<'a>(
        capabilities: &'a [Value],
        local: bool,
        window: &str,
        origin: &str,
        platform: &str,
    ) -> Vec<&'a Value> {
        capabilities
            .iter()
            .filter(|capability| {
                let local_enabled = capability
                    .get("local")
                    .and_then(Value::as_bool)
                    .unwrap_or(true);
                let origin_matches = if local {
                    local_enabled
                } else {
                    capability["remote"]["urls"].as_array().is_some_and(|urls| {
                        urls.iter().any(|url| {
                            url.as_str()
                                .and_then(|pattern| pattern.strip_suffix('*'))
                                .is_some_and(|prefix| origin.starts_with(prefix))
                        })
                    })
                };
                origin_matches
                    && capability["windows"]
                        .as_array()
                        .is_some_and(|windows| windows.iter().any(|value| value == window))
                    && capability.get("platforms").is_none_or(|platforms| {
                        platforms
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|value| value == platform)
                    })
            })
            .collect()
    }

    #[test]
    fn capability_matrix_resolves_exact_local_remote_mobile_and_desktop_authority() {
        let capabilities: Vec<Value> =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert_eq!(capabilities.len(), 4);
        let expected_opener = json!({
            "identifier": "opener:allow-open-url",
            "allow": [{ "url": "http://*" }, { "url": "https://*" }]
        });
        for identifier in ["default", "remote-shell-common"] {
            let capability = capabilities
                .iter()
                .find(|capability| capability["identifier"] == identifier)
                .unwrap();
            let grants: Vec<_> = capability["permissions"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|permission| permission["identifier"] == "opener:allow-open-url")
                .collect();
            assert_eq!(grants, vec![&expected_opener]);
        }
        let desktop_remote = capabilities
            .iter()
            .find(|capability| capability["identifier"] == "remote-shell-desktop")
            .unwrap();
        assert!(!capability_permissions(desktop_remote)
            .iter()
            .any(
                |permission| permission.starts_with("opener:") || permission.starts_with("shell:")
            ));
        let identifiers: BTreeSet<_> = capabilities
            .iter()
            .map(|capability| capability["identifier"].as_str().unwrap())
            .collect();
        assert_eq!(
            identifiers,
            BTreeSet::from([
                "default",
                "local-shell-desktop",
                "remote-shell-common",
                "remote-shell-desktop",
            ])
        );
        for platform in ["android", "iOS"] {
            let local =
                resolve_capabilities(&capabilities, true, "main", "asset://localhost/", platform);
            assert_eq!(local.len(), 1);
            assert_eq!(local[0]["identifier"], "default");
            assert!(!capability_permissions(local[0]).contains("core:window:allow-set-fullscreen"));
        }
        for platform in ["linux", "macOS", "windows"] {
            let local =
                resolve_capabilities(&capabilities, true, "main", "asset://localhost/", platform);
            assert_eq!(local.len(), 2);
            let permissions: BTreeSet<_> = local
                .iter()
                .flat_map(|capability| capability_permissions(capability))
                .collect();
            for required in [
                "core:window:allow-set-fullscreen",
                "process:allow-exit",
                "process:allow-restart",
                "updater:default",
            ] {
                assert!(
                    permissions.contains(required),
                    "missing {required} on local {platform}"
                );
            }
        }
        let trusted = "https://phase-rs.dev/game";
        for platform in ["android", "iOS"] {
            let resolved = resolve_capabilities(&capabilities, false, "main", trusted, platform);
            assert_eq!(resolved.len(), 1);
            assert_eq!(resolved[0]["identifier"], "remote-shell-common");
            let permissions = capability_permissions(resolved[0]);
            for required in [
                "allow-host-platform",
                "allow-ensure-native-engine",
                "allow-connect-native-engine",
            ] {
                assert!(permissions.contains(required));
            }
            for forbidden in [
                "updater:default",
                "process:allow-exit",
                "process:allow-restart",
                "core:window:allow-set-fullscreen",
            ] {
                assert!(!permissions.contains(forbidden));
            }
        }
        for platform in ["linux", "macOS", "windows"] {
            let resolved = resolve_capabilities(&capabilities, false, "main", trusted, platform);
            assert_eq!(resolved.len(), 2);
            let permissions: BTreeSet<_> = resolved
                .iter()
                .flat_map(|capability| capability_permissions(capability))
                .collect();
            for required in [
                "allow-host-platform",
                "allow-ensure-native-engine",
                "allow-connect-native-engine",
                "updater:default",
                "process:allow-exit",
                "process:allow-restart",
                "core:window:allow-set-fullscreen",
            ] {
                assert!(
                    permissions.contains(required),
                    "missing {required} on {platform}"
                );
            }
        }
        assert!(resolve_capabilities(
            &capabilities,
            false,
            "main",
            "https://evil.example/",
            "android"
        )
        .is_empty());
        assert!(resolve_capabilities(&capabilities, false, "wrong", trusted, "android").is_empty());
    }
}
