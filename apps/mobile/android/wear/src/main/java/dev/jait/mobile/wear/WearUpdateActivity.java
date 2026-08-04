package dev.jait.mobile.wear;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;

public class WearUpdateActivity extends Activity {
    private static final int REQUEST_INSTALL_PERMISSION = 1;
    private boolean permissionRequested;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        continueInstallation();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (permissionRequested && canInstallPackages()) {
            permissionRequested = false;
            launchPackageInstaller();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_INSTALL_PERMISSION) return;
        permissionRequested = false;
        if (canInstallPackages()) {
            launchPackageInstaller();
        } else {
            Toast.makeText(this, "Allow Jait to install the watch update", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void continueInstallation() {
        File apkFile = WearUpdater.getApkFile(this);
        if (apkFile == null || !apkFile.isFile()) {
            finish();
            return;
        }
        if (!canInstallPackages()) {
            permissionRequested = true;
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            try {
                startActivityForResult(permissionIntent, REQUEST_INSTALL_PERMISSION);
            } catch (Exception error) {
                Toast.makeText(this, "Open Settings and allow Jait to install apps", Toast.LENGTH_LONG).show();
                finish();
            }
            return;
        }
        launchPackageInstaller();
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getPackageManager().canRequestPackageInstalls();
    }

    private void launchPackageInstaller() {
        File apkFile = WearUpdater.getApkFile(this);
        if (apkFile == null || !apkFile.isFile()) {
            finish();
            return;
        }
        Uri apkUri = FileProvider.getUriForFile(
            this,
            getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(installIntent);
        } catch (Exception error) {
            Toast.makeText(this, "Could not open the watch installer", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
