/**
 * Jait Explorer Context Menu — IExplorerCommand COM shell extension.
 *
 * Registers "Open with Jait" in the Windows 11 modern right-click menu
 * for directories, directory backgrounds, and files.
 *
 * Build: cl /LD /EHsc /O2 /DUNICODE /D_UNICODE explorer-command.cpp
 *            explorer-command.def ole32.lib shell32.lib shlwapi.lib
 *            /Fe:jait_explorer_command_x64.dll
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <strsafe.h>
#include <new>

// {E257B40C-B09A-4A25-AFDD-2268CD2B1E48}
static const CLSID CLSID_JaitExplorerCommand =
    {0xe257b40c, 0xb09a, 0x4a25, {0xaf, 0xdd, 0x22, 0x68, 0xcd, 0x2b, 0x1e, 0x48}};

static HMODULE g_hModule = nullptr;
static long    g_refModule = 0;

// ── Utility: find Jait.exe relative to this DLL ───────────────────────
// DLL lives at  <install>\resources\appx\jait_explorer_command_x64.dll
// Exe lives at  <install>\Jait.exe
static bool GetJaitExePath(wchar_t* buf, DWORD cch) {
    if (!GetModuleFileNameW(g_hModule, buf, cch)) return false;
    // Walk up from  ...\resources\appx\dll  →  ...\resources\appx
    PathRemoveFileSpecW(buf);
    // →  ...\resources
    PathRemoveFileSpecW(buf);
    // →  <install>
    PathRemoveFileSpecW(buf);
    return PathAppendW(buf, L"Jait.exe") == TRUE;
}

// ── IExplorerCommand implementation ───────────────────────────────────

class JaitExplorerCommand final : public IExplorerCommand {
    long m_ref = 1;

public:
    // IUnknown
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        static const QITAB qit[] = {
            QITABENT(JaitExplorerCommand, IExplorerCommand),
            {nullptr, 0},
        };
        return QISearch(this, qit, riid, ppv);
    }
    ULONG STDMETHODCALLTYPE AddRef()  override { return InterlockedIncrement(&m_ref); }
    ULONG STDMETHODCALLTYPE Release() override {
        long r = InterlockedDecrement(&m_ref);
        if (r == 0) { delete this; InterlockedDecrement(&g_refModule); }
        return r;
    }

    // IExplorerCommand
    HRESULT STDMETHODCALLTYPE GetTitle(IShellItemArray*, LPWSTR* ppszName) override {
        return SHStrDupW(L"Open with Jait", ppszName);
    }

    HRESULT STDMETHODCALLTYPE GetIcon(IShellItemArray*, LPWSTR* ppszIcon) override {
        wchar_t path[MAX_PATH];
        if (!GetJaitExePath(path, MAX_PATH)) return E_FAIL;
        // Icon reference: exe path + icon index 0
        wchar_t icon[MAX_PATH + 8];
        StringCchPrintfW(icon, ARRAYSIZE(icon), L"%s,0", path);
        return SHStrDupW(icon, ppszIcon);
    }

    HRESULT STDMETHODCALLTYPE GetToolTip(IShellItemArray*, LPWSTR* ppszTip) override {
        *ppszTip = nullptr;
        return E_NOTIMPL;
    }

    HRESULT STDMETHODCALLTYPE GetCanonicalName(GUID* pguid) override {
        *pguid = CLSID_JaitExplorerCommand;
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE GetState(IShellItemArray*, BOOL, EXPCMDSTATE* pState) override {
        *pState = ECS_ENABLED;
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE Invoke(IShellItemArray* psiItemArray, IBindCtx*) override {
        wchar_t exePath[MAX_PATH];
        if (!GetJaitExePath(exePath, MAX_PATH)) return E_FAIL;

        wchar_t arg[MAX_PATH] = {};

        if (psiItemArray) {
            DWORD count = 0;
            psiItemArray->GetCount(&count);
            if (count > 0) {
                IShellItem* psi = nullptr;
                if (SUCCEEDED(psiItemArray->GetItemAt(0, &psi))) {
                    LPWSTR pszPath = nullptr;
                    if (SUCCEEDED(psi->GetDisplayName(SIGDN_FILESYSPATH, &pszPath))) {
                        StringCchCopyW(arg, MAX_PATH, pszPath);
                        CoTaskMemFree(pszPath);
                    }
                    psi->Release();
                }
            }
        }

        // Build command line: "Jait.exe" "path"
        wchar_t cmdLine[MAX_PATH * 3];
        if (arg[0]) {
            StringCchPrintfW(cmdLine, ARRAYSIZE(cmdLine), L"\"%s\" \"%s\"", exePath, arg);
        } else {
            StringCchPrintfW(cmdLine, ARRAYSIZE(cmdLine), L"\"%s\"", exePath);
        }

        STARTUPINFOW si = {sizeof(si)};
        PROCESS_INFORMATION pi = {};
        if (CreateProcessW(exePath, cmdLine, nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
        }

        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE GetFlags(EXPCMDFLAGS* pFlags) override {
        *pFlags = ECF_DEFAULT;
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE EnumSubCommands(IEnumExplorerCommand** ppEnum) override {
        *ppEnum = nullptr;
        return E_NOTIMPL;
    }
};

// ── Class factory ─────────────────────────────────────────────────────

class JaitCommandFactory final : public IClassFactory {
    long m_ref = 1;

public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_IUnknown || riid == IID_IClassFactory) {
            *ppv = static_cast<IClassFactory*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef()  override { return InterlockedIncrement(&m_ref); }
    ULONG STDMETHODCALLTYPE Release() override {
        long r = InterlockedDecrement(&m_ref);
        if (r == 0) delete this;
        return r;
    }

    HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppv) override {
        if (pUnkOuter) return CLASS_E_NOAGGREGATION;
        auto* cmd = new (std::nothrow) JaitExplorerCommand();
        if (!cmd) return E_OUTOFMEMORY;
        InterlockedIncrement(&g_refModule);
        HRESULT hr = cmd->QueryInterface(riid, ppv);
        cmd->Release();
        return hr;
    }

    HRESULT STDMETHODCALLTYPE LockServer(BOOL fLock) override {
        if (fLock) InterlockedIncrement(&g_refModule);
        else       InterlockedDecrement(&g_refModule);
        return S_OK;
    }
};

// ── DLL exports ───────────────────────────────────────────────────────

extern "C" BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_hModule = hModule;
        DisableThreadLibraryCalls(hModule);
    }
    return TRUE;
}

extern "C" HRESULT STDAPICALLTYPE DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv) {
    if (rclsid != CLSID_JaitExplorerCommand) return CLASS_E_CLASSNOTAVAILABLE;
    auto* factory = new (std::nothrow) JaitCommandFactory();
    if (!factory) return E_OUTOFMEMORY;
    HRESULT hr = factory->QueryInterface(riid, ppv);
    factory->Release();
    return hr;
}

extern "C" HRESULT STDAPICALLTYPE DllCanUnloadNow() {
    return g_refModule == 0 ? S_OK : S_FALSE;
}
