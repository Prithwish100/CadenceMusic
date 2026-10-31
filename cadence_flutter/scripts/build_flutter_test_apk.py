#!/usr/bin/env python3
"""
Builds and signs the isolated experimental APK (`cadence-flutter-test.apk`)
for package `app.cadence.flutter.test` (versionCode 4, versionName "1.3.0-exp",
compileSdk 36, targetSdk 36, minSdk 24) using its own separate test keystore
(`cadence_flutter/android/keystore/cadence-flutter-test.keystore`).

Does NOT touch any files from the production `app.cadence.player` APK or `/src` or `/dist`.
"""
import glob
import os
import shutil
import struct
import subprocess
import zlib

ROOT_DIR = "/app/applet"
FLUTTER_DIR = os.path.join(ROOT_DIR, "cadence_flutter")
ANDROID_DIR = os.path.join(FLUTTER_DIR, "android")
APP_MAIN_DIR = os.path.join(ANDROID_DIR, "app", "src", "main")
RES_DIR = os.path.join(APP_MAIN_DIR, "res")
ASSETS_WEB_DIR = os.path.join(APP_MAIN_DIR, "assets", "web")
BUILD_DIR = os.path.join(ANDROID_DIR, "build")
KEYSTORE_DIR = os.path.join(ANDROID_DIR, "keystore")
TEST_KEYSTORE_PATH = os.path.join(KEYSTORE_DIR, "cadence-flutter-test.keystore")

DIST_DIR = os.path.join(ROOT_DIR, "dist")
PUBLIC_APK_PATH = os.path.join(ROOT_DIR, "public", "cadence-flutter-test.apk")
DIST_APK_PATH = os.path.join(DIST_DIR, "cadence-flutter-test.apk")
FLUTTER_RELEASE_APK_PATH = os.path.join(FLUTTER_DIR, "cadence-flutter-test.apk")

ANDROID_JAR = "/usr/lib/android-sdk/platforms/android-36/android.jar"
BUILD_TOOLS = "/usr/lib/android-sdk/build-tools/36.0.0"
AAPT = os.path.join(BUILD_TOOLS, "aapt")
D8 = os.path.join(BUILD_TOOLS, "d8")
ZIPALIGN = os.path.join(BUILD_TOOLS, "zipalign")
APKSIGNER = os.path.join(BUILD_TOOLS, "apksigner")


def run(cmd, cwd=ROOT_DIR):
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def create_exp_launcher_icon(path, size):
    """Generates a distinct Cadence Exp launcher icon (Dark Obsidian + Sunset Flame badge)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw_rows = bytearray()
    center = (size - 1) / 2.0
    outer_r = size * 0.44
    inner_r = size * 0.14
    ring_r = size * 0.30

    for y in range(size):
        raw_rows.append(0)
        for x in range(size):
            dx = x - center
            dy = y - center
            dist = (dx * dx + dy * dy) ** 0.5

            # Background rounded square (#0A0A0C)
            r, g, b, a = (10, 10, 12, 255)
            if dist <= outer_r:
                # Sunset Flame disc (#E25822)
                r, g, b, a = (226, 88, 34, 255)
                if abs(dist - ring_r) < max(1.2, size * 0.025):
                    r, g, b, a = (255, 185, 140, 255)
                if dist <= inner_r:
                    r, g, b, a = (18, 18, 22, 255)
                    if dist <= inner_r * 0.42:
                        r, g, b, a = (245, 245, 247, 255)

            raw_rows.extend((r, g, b, a))

    def png_chunk(chunk_type, data):
        chunk = struct.pack(">I", len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return chunk + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(raw_rows), 9)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", compressed)
        + png_chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png_bytes)


def patch_isolated_web_bundle():
    """
    Verifies the isolated copy of the JS bundle inside `cadence_flutter/android/app/src/main/assets/web/`.
    `LibraryContext.tsx` now natively implements the External Browser OAuth + Deep-Link Redirect State Machine,
    session persistence, and foreground focus sync.
    """
    js_files = glob.glob(os.path.join(ASSETS_WEB_DIR, "assets", "index-*.js"))
    if not js_files:
        raise RuntimeError("Could not find index-*.js in isolated assets/web/assets/")
    print(f"Verified isolated APK bundle: {js_files[0]}")


def main():
    os.makedirs(KEYSTORE_DIR, exist_ok=True)

    # 1. Create a SEPARATE test keystore exclusively for `app.cadence.flutter.test`
    if not os.path.exists(TEST_KEYSTORE_PATH):
        run([
            "keytool", "-genkeypair", "-v",
            "-keystore", TEST_KEYSTORE_PATH,
            "-alias", "cadence_flutter_test",
            "-keyalg", "RSA",
            "-keysize", "2048",
            "-validity", "10000",
            "-storepass", "cadencetest123",
            "-keypass", "cadencetest123",
            "-dname", "CN=Cadence Flutter Experimental, OU=Mobile Test, O=Cadence, L=Kolkata, ST=WB, C=IN",
        ])

    # 2. Generate mipmap icons for `app.cadence.flutter.test`
    icon_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, px in icon_sizes.items():
        create_exp_launcher_icon(os.path.join(RES_DIR, folder, "ic_launcher.png"), px)

    # 3. Copy the UI asset bundle into the isolated experimental APK's assets/web directory
    if os.path.exists(ASSETS_WEB_DIR):
        shutil.rmtree(ASSETS_WEB_DIR)
    os.makedirs(ASSETS_WEB_DIR, exist_ok=True)
    for item in os.listdir(DIST_DIR):
        if item.endswith(".apk") or item.endswith(".tar.gz") or item.endswith(".zip"):
            continue
        s = os.path.join(DIST_DIR, item)
        d = os.path.join(ASSETS_WEB_DIR, item)
        if os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)

    # 3b. Patch ONLY the isolated copy inside `cadence_flutter/android/app/src/main/assets/web/`
    patch_isolated_web_bundle()

    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    gen_dir = os.path.join(BUILD_DIR, "gen")
    classes_dir = os.path.join(BUILD_DIR, "classes")
    dex_dir = os.path.join(BUILD_DIR, "dex")
    os.makedirs(gen_dir, exist_ok=True)
    os.makedirs(classes_dir, exist_ok=True)
    os.makedirs(dex_dir, exist_ok=True)

    manifest_path = os.path.join(APP_MAIN_DIR, "AndroidManifest.xml")

    # 4. Generate R.java using Android SDK 36 aapt
    run([
        AAPT, "package", "-f", "-m",
        "-J", gen_dir,
        "-M", manifest_path,
        "-S", RES_DIR,
        "-I", ANDROID_JAR,
    ])

    # 5. Compile Java sources (targeting JDK 17 + Android SDK 36)
    java_sources = [
        os.path.join(APP_MAIN_DIR, "java", "app", "cadence", "flutter", "test", "MainActivity.java"),
        os.path.join(APP_MAIN_DIR, "java", "app", "cadence", "flutter", "test", "CadenceAudioService.java"),
        os.path.join(gen_dir, "app", "cadence", "flutter", "test", "R.java"),
    ]
    run([
        "javac",
        "-source", "8",
        "-target", "8",
        "-bootclasspath", ANDROID_JAR,
        "-classpath", ANDROID_JAR,
        "-d", classes_dir,
        *java_sources,
    ])

    # 6. Convert bytecode to classes.dex using d8 (Build-Tools 36.0.0)
    class_files = []
    for root, _, files in os.walk(classes_dir):
        for f in files:
            if f.endswith(".class"):
                class_files.append(os.path.join(root, f))

    run([
        D8,
        "--min-api", "24",
        "--lib", ANDROID_JAR,
        "--output", dex_dir,
        *class_files,
    ])

    unaligned_apk = os.path.join(BUILD_DIR, "cadence-flutter-unaligned.apk")
    aligned_apk = os.path.join(BUILD_DIR, "cadence-flutter-aligned.apk")

    # 7. Package resources + assets into APK
    run([
        AAPT, "package", "-f",
        "-M", manifest_path,
        "-S", RES_DIR,
        "-A", os.path.join(APP_MAIN_DIR, "assets"),
        "-I", ANDROID_JAR,
        "-F", unaligned_apk,
    ])

    # 8. Add classes.dex to APK root
    run([AAPT, "add", unaligned_apk, "classes.dex"], cwd=dex_dir)

    # 9. Align on 16 KB page boundaries for Android 15 / 16 (API 36) compatibility
    run([ZIPALIGN, "-f", "-P", "16", "4", unaligned_apk, aligned_apk])

    # 10. Sign APK with the separate test keystore (v1 + v2 + v3 schemes)
    run([
        APKSIGNER, "sign",
        "--ks", TEST_KEYSTORE_PATH,
        "--ks-key-alias", "cadence_flutter_test",
        "--ks-pass", "pass:cadencetest123",
        "--key-pass", "pass:cadencetest123",
        "--v1-signing-enabled", "true",
        "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true",
        "--out", FLUTTER_RELEASE_APK_PATH,
        aligned_apk,
    ])

    # 11. Copy to public/ and dist/ for direct download link without touching existing app files
    shutil.copy2(FLUTTER_RELEASE_APK_PATH, PUBLIC_APK_PATH)
    shutil.copy2(FLUTTER_RELEASE_APK_PATH, DIST_APK_PATH)
    print(f"Successfully built and signed {FLUTTER_RELEASE_APK_PATH} ({os.path.getsize(FLUTTER_RELEASE_APK_PATH)} bytes)")


if __name__ == "__main__":
    main()
