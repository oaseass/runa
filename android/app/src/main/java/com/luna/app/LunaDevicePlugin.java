package com.luna.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LunaDevice")
public class LunaDevicePlugin extends Plugin {
    private BroadcastReceiver apkDownloadReceiver;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            PackageInfo packageInfo = packageManager.getPackageInfo(getContext().getPackageName(), 0);

            JSObject result = new JSObject();
            result.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            result.put("versionCode", PackageInfoCompat.getLongVersionCode(packageInfo));
            result.put("packageName", packageInfo.packageName);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("앱 버전 정보를 읽지 못했어요.", exception);
        }
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("업데이트 링크를 열지 못했어요.", exception);
        }
    }

    @PluginMethod
    public void startApkUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            DownloadManager downloadManager = ContextCompat.getSystemService(getContext(), DownloadManager.class);
            if (downloadManager == null) {
                call.reject("다운로드 매니저를 사용할 수 없어요.");
                return;
            }

            Uri downloadUri = Uri.parse(url);
            DownloadManager.Request request = new DownloadManager.Request(downloadUri);
            request.setTitle("LUNA 업데이트 다운로드");
            request.setDescription("최신 앱 설치 파일을 준비하고 있어요.");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setMimeType("application/vnd.android.package-archive");
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, "luna-update.apk");

            long downloadId = downloadManager.enqueue(request);
            registerApkInstallReceiver(downloadManager, downloadId);

            JSObject result = new JSObject();
            result.put("downloadId", downloadId);
            result.put("status", "queued");
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("업데이트 다운로드를 시작하지 못했어요.", exception);
        }
    }

    private void registerApkInstallReceiver(DownloadManager downloadManager, long downloadId) {
        unregisterApkInstallReceiver();

        apkDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(android.content.Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (completedId != downloadId) {
                    return;
                }

                try {
                    installDownloadedApk(downloadManager, downloadId);
                } finally {
                    unregisterApkInstallReceiver();
                }
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(apkDownloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(apkDownloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }
    }

    private void installDownloadedApk(DownloadManager downloadManager, long downloadId) {
        Uri downloadedUri = downloadManager.getUriForDownloadedFile(downloadId);
        if (downloadedUri == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settingsIntent);
            return;
        }

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(downloadedUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            getContext().startActivity(installIntent);
        } catch (ActivityNotFoundException exception) {
            Intent fallbackIntent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallbackIntent);
        }
    }

    private void unregisterApkInstallReceiver() {
        if (apkDownloadReceiver == null) {
            return;
        }

        try {
            getContext().unregisterReceiver(apkDownloadReceiver);
        } catch (IllegalArgumentException ignored) {
        }

        apkDownloadReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterApkInstallReceiver();
        super.handleOnDestroy();
    }
}