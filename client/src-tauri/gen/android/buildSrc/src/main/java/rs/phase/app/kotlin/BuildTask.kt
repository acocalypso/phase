package rs.phase.app.kotlin

import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import org.gradle.process.internal.ExecException

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val tauriJs = findTauriJs()

        if (tauriJs != null) {
            runWithNode(tauriJs.absolutePath)
        } else {
            // Fallback to npx if node_modules is not found in parent directories
            runWithExecutable("npx", isNpx = true)
        }
    }

    private fun findTauriJs(): File? {
        var current: File? = project.projectDir
        while (current != null) {
            val tauriJs = File(current, "node_modules/@tauri-apps/cli/tauri.js")
            if (tauriJs.exists()) return tauriJs
            current = current.parentFile
        }
        return null
    }

    private fun runWithNode(scriptPath: String) {
        runWithExecutable("node", scriptPath = scriptPath)
    }

    private fun runWithExecutable(executable: String, isNpx: Boolean = false, scriptPath: String? = null) {
        if (rootDirRel == null) throw GradleException("rootDirRel cannot be null")
        
        try {
            execute(executable, isNpx, scriptPath)
        } catch (e: Exception) {
            // Only try fallbacks if the initial command failed to START (e.g. file not found)
            // or if it's a known issue where we need to try .cmd/.bat on Windows.
            // We check if it's an ExecException which usually means it started but failed.
            if (e is ExecException) {
                throw e
            }

            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                val fallbacks = listOf("$executable.exe", "$executable.cmd", "$executable.bat")
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        execute(fallback, isNpx, scriptPath)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e
            }
        }
    }

    private fun execute(executable: String, isNpx: Boolean, scriptPath: String?) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        val isWindows = Os.isFamily(Os.FAMILY_WINDOWS)
        val execPath = if (isWindows) "cmd" else executable
        val baseArgs = if (isWindows) listOf("/c", executable) else emptyList()
        
        val tauriArgs = mutableListOf<String>()
        if (isNpx) {
            tauriArgs.add("tauri")
        } else if (scriptPath != null) {
            tauriArgs.add(scriptPath)
        }
        
        tauriArgs.addAll(listOf("android", "android-studio-script"))

        try {
            project.exec {
                workingDir(File(project.projectDir, rootDirRel))
                executable(execPath)
                args(baseArgs)
                args(tauriArgs)
                if (project.logger.isEnabled(LogLevel.DEBUG)) {
                    args("-vv")
                } else if (project.logger.isEnabled(LogLevel.INFO)) {
                    args("-v")
                }
                if (release) {
                    args("--release")
                }
                args(listOf("--target", target))
                
                // Tauri v2 android-studio-script requires a management port if it's a debug build.
                // When running via gradlew directly, this isn't available.
                // We can try to suppress some of the CLI's panic behavior by setting environment variables
                // if they are not already set.
                // environment("TAURI_CLI_SKIP_MANAGEMENT_CLIENT", "true")
            }.assertNormalExitValue()
        } catch (e: ExecException) {
            // Provide a more helpful error message for the Tauri v2 panic
            if (e.message?.contains("exit value 1") == true || e.message?.contains("exit value -1073740791") == true) {
                logger.error("\n[Tauri Build Error] The Tauri CLI panicked. This often happens in Tauri v2 when running Gradle tasks directly.")
                logger.error("If you are doing a debug build, please ensure the Tauri dev server is running or use 'pnpm tauri android dev'.")
                logger.error("If you want to build a standalone APK, use 'pnpm tauri android build'.\n")
            }
            throw e
        }
    }
}
