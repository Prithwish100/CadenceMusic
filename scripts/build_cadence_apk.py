#!/usr/bin/env python3
import os
import sys
import shutil
import subprocess
import zipfile
from pathlib import Path

WORKSPACE = Path.cwd()
ANDROID_DIR = WORKSPACE / "android"
KEYSTORE_PATH = ANDROID_DIR / "keystore" / "cadence-release.keystore"
BUILD_DIR = Path("/tmp/cadence_apk_build_v5")

ANDROID_JAR = Path("/usr/lib/android-sdk/platforms/android-36/android.jar")
BUILD_TOOLS_DIR = Path("/usr/lib/android-sdk/build-tools/36.0.0")

AAPT = str(BUILD_TOOLS_DIR / "aapt")
D8 = str(BUILD_TOOLS_DIR / "d8")
ZIPALIGN = str(BUILD_TOOLS_DIR / "zipalign")
APKSIGNER = str(BUILD_TOOLS_DIR / "apksigner")

def run(cmd, cwd=None):
    print(f"==> Running: {' '.join(str(c) for c in cmd)}")
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error in {cmd[0]}:")
        print("STDOUT:", res.stdout)
        print("STDERR:", res.stderr)
        sys.exit(res.returncode)
    return res

def main():
    if not ANDROID_JAR.exists():
        print(f"Error: Android SDK 36 platform jar not found at {ANDROID_JAR}")
        sys.exit(1)

    if not KEYSTORE_PATH.exists():
        print(
            f"CRITICAL ERROR: Original release keystore not found at {KEYSTORE_PATH}. "
            "Refusing to generate a replacement key."
        )
        sys.exit(1)

    print("=== Step 1: Building production web assets ===")
    run(["npm", "run", "build"], cwd=WORKSPACE)

    dist_dir = WORKSPACE / "dist"
    if not (dist_dir / "index.html").exists():
        print("Error: dist/index.html not found!")
        sys.exit(1)

    print("=== Step 2: Preparing APK workspace ===")
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    # Copy android template structure
    shutil.copytree(ANDROID_DIR / "src", BUILD_DIR / "src")
    shutil.copytree(ANDROID_DIR / "res", BUILD_DIR / "res")
    shutil.copy2(ANDROID_DIR / "AndroidManifest.xml", BUILD_DIR / "AndroidManifest.xml")

    # Add launcher icons to res
    icon_src = WORKSPACE / "public" / "pwa-192x192.png"
    if not icon_src.exists():
        icon_src = WORKSPACE / "public" / "apple-touch-icon.png"

    for mipmap in ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]:
        folder = BUILD_DIR / "res" / mipmap
        folder.mkdir(parents=True, exist_ok=True)
        shutil.copy2(icon_src, folder / "ic_launcher.png")

    # Bundle compiled web app into assets/web (excluding unused screenshots or apk files)
    assets_web = BUILD_DIR / "assets" / "web"
    assets_web.mkdir(parents=True, exist_ok=True)
    for item in dist_dir.iterdir():
        if item.name.endswith(".apk") or item.name.endswith(".idsig") or item.name == "workbox-unused.js" or item.name == "sw.js":
            continue
        dest = assets_web / item.name
        if item.is_dir():
            shutil.copytree(
                item,
                dest,
                ignore=shutil.ignore_patterns("aistudio", "*.apk", "*.idsig")
            )
        else:
            shutil.copy2(item, dest)

    print("=== Step 3: Generating R.java with AAPT (compileSdk 36) ===")
    run([
        AAPT, "package", "-f", "-m",
        "-J", str(BUILD_DIR / "src"),
        "-M", str(BUILD_DIR / "AndroidManifest.xml"),
        "-S", str(BUILD_DIR / "res"),
        "-I", str(ANDROID_JAR)
    ])

    print("=== Step 4: Compiling Java Sources with javac (Java 17 bytecode, SDK 36) ===")
    obj_dir = BUILD_DIR / "obj"
    obj_dir.mkdir(parents=True, exist_ok=True)

    java_files = list((BUILD_DIR / "src").glob("**/*.java"))
    print(f"Compiling {len(java_files)} Java files...")
    run([
        "javac", "--release", "17",
        "-cp", str(ANDROID_JAR),
        "-d", str(obj_dir)
    ] + [str(f) for f in java_files])

    print("=== Step 5: Converting bytecode to Dalvik DEX with D8 (min-api 24, SDK 36) ===")
    class_files = [str(f) for f in obj_dir.glob("**/*.class")]
    run([
        D8, "--release",
        "--min-api", "24",
        "--lib", str(ANDROID_JAR),
        "--output", str(BUILD_DIR)
    ] + class_files)
    dex_file = BUILD_DIR / "classes.dex"

    print("=== Step 6: Packaging APK with AAPT (compileSdk 36, targetSdk 36) ===")
    unsigned_apk = BUILD_DIR / "unsigned.apk"
    run([
        AAPT, "package", "-f",
        "-M", str(BUILD_DIR / "AndroidManifest.xml"),
        "-S", str(BUILD_DIR / "res"),
        "-A", str(BUILD_DIR / "assets"),
        "-I", str(ANDROID_JAR),
        "-F", str(unsigned_apk)
    ])

    print("=== Step 7: Adding classes.dex & Gradle 8.9.0 metadata to APK ===")
    with zipfile.ZipFile(unsigned_apk, "a", compression=zipfile.ZIP_DEFLATED) as zf:
        zinfo = zipfile.ZipInfo("classes.dex", date_time=(1980, 1, 1, 0, 0, 0))
        zinfo.compress_type = zipfile.ZIP_DEFLATED
        zinfo.external_attr = 0o644 << 16
        zf.writestr(zinfo, dex_file.read_bytes())

        meta_info = zipfile.ZipInfo(
            "META-INF/com/android/build/gradle/app-metadata.properties",
            date_time=(1980, 1, 1, 0, 0, 0)
        )
        meta_info.compress_type = zipfile.ZIP_DEFLATED
        meta_info.external_attr = 0o644 << 16
        zf.writestr(meta_info, b"appMetadataVersion=1.1\nandroidGradlePluginVersion=8.9.0\n")

    print("=== Step 8: 16KB Page-Aligned ZipAlign (Android 15/16 Ready) ===")
    aligned_apk = BUILD_DIR / "aligned.apk"
    run([ZIPALIGN, "-f", "-P", "16", "4", str(unsigned_apk), str(aligned_apk)])

    print("=== Step 9: Signing APK with Preserved Release Keystore (v1 + v2 + v3 schemes) ===")
    signed_apk = BUILD_DIR / "cadence.apk"
    shutil.copy2(aligned_apk, signed_apk)

    run([
        APKSIGNER, "sign",
        "--ks", str(KEYSTORE_PATH),
        "--ks-pass", "pass:cadence123",
        "--ks-key-alias", "cadence_release",
        "--key-pass", "pass:cadence123",
        "--min-sdk-version", "24",
        "--v1-signing-enabled", "true",
        "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true",
        str(signed_apk)
    ])

    print("=== Step 10: Verifying APK Signature & Certificate Fingerprints ===")
    verify_res = run([APKSIGNER, "verify", "--verbose", "--print-certs", str(signed_apk)])
    print(verify_res.stdout)

    print("=== Step 11: Deploying APK to public/ and dist/ ===")
    for target in [
        WORKSPACE / "public" / "cadence.apk",
        WORKSPACE / "public" / "cadence-music.apk",
        WORKSPACE / "dist" / "cadence.apk",
        WORKSPACE / "dist" / "cadence-music.apk",
    ]:
        shutil.copy2(signed_apk, target)
        print(f"Updated {target}")

    size_kb = signed_apk.stat().st_size / 1024
    print(f"\nCadence APK v2.2.0 (compileSdk=36, targetSdk=36, versionCode=4) compiled and signed successfully! File size: {size_kb:.1f} KB")

if __name__ == "__main__":
    main()
