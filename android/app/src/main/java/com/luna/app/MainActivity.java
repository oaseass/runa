package com.luna.app;

import android.webkit.ValueCallback;
import android.webkit.WebSettings;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.luna.app.contacts.LunaContactsPlugin;
import com.getcapacitor.BridgeActivity;
import com.luna.app.LunaDevicePlugin;
import com.luna.app.iap.LunaIapPlugin;

public class MainActivity extends BridgeActivity {
	private boolean exitDialogVisible = false;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(LunaContactsPlugin.class);
		registerPlugin(LunaDevicePlugin.class);
		registerPlugin(LunaIapPlugin.class);
		WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
		super.onCreate(savedInstanceState);
		configureRemoteWebViewCache();
		getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
			@Override
			public void handleOnBackPressed() {
				handleHardwareBackPress();
			}
		});
	}

	private void configureRemoteWebViewCache() {
		if (bridge == null || bridge.getWebView() == null) {
			return;
		}

		WebSettings settings = bridge.getWebView().getSettings();
		settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
		settings.setDomStorageEnabled(true);
		bridge.getWebView().clearCache(true);
		bridge.getWebView().clearHistory();
		bridge.getWebView().post(() -> bridge.getWebView().reload());
	}

	private void handleHardwareBackPress() {
		if (bridge == null || bridge.getWebView() == null) {
			showExitDialog();
			return;
		}

		if (bridge.getWebView().canGoBack()) {
			bridge.getWebView().goBack();
			return;
		}

		bridge.getWebView().evaluateJavascript(
			"(function(){" +
				"try {" +
					"if (window.history.length > 1 || document.referrer) {" +
						"window.history.back();" +
						"return 'went-back';" +
					"}" +
					"return 'no-history';" +
				"} catch (e) {" +
					"return 'error';" +
				"}" +
			"})()",
			new ValueCallback<String>() {
				@Override
				public void onReceiveValue(String value) {
					String normalized = value == null ? "" : value.replace("\"", "");
					if (!"went-back".equals(normalized)) {
						showExitDialog();
					}
				}
			}
		);
	}

	private void showExitDialog() {
		if (exitDialogVisible || isFinishing()) {
			return;
		}

		exitDialogVisible = true;
		new AlertDialog.Builder(this)
			.setMessage("종료하시겠습니까?")
			.setCancelable(true)
			.setPositiveButton("종료", (dialog, which) -> {
				exitDialogVisible = false;
				finish();
			})
			.setNegativeButton("취소", (dialog, which) -> {
				exitDialogVisible = false;
				dialog.dismiss();
			})
			.setOnCancelListener(dialog -> exitDialogVisible = false)
			.show();
	}
}
