package com.spendlyapp.personal

import android.content.ComponentName
import android.content.Intent
import android.content.SharedPreferences
import android.provider.Settings
import android.text.TextUtils
import com.facebook.react.bridge.*
import org.json.JSONArray

/**
 * React Native bridge module that exposes transaction detection
 * functionality to the JavaScript layer.
 */
class TransactionBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "TransactionDetectionModule"
        private const val PREFS_NAME = "spendly_detected_transactions"
        private const val PREFS_KEY_TRANSACTIONS = "transactions"
        private const val PREFS_KEY_ENABLED = "detection_enabled"
    }

    private val prefs: SharedPreferences by lazy {
        reactApplicationContext.getSharedPreferences(PREFS_NAME, 0)
    }

    override fun getName(): String = MODULE_NAME

    /**
     * Check if the NotificationListenerService permission is enabled.
     */
    @ReactMethod
    fun isNotificationListenerEnabled(promise: Promise) {
        try {
            val context = reactApplicationContext
            val flat = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            )
            if (!TextUtils.isEmpty(flat)) {
                val names = flat.split(":")
                for (name in names) {
                    val cn = ComponentName.unflattenFromString(name)
                    if (cn != null && cn.packageName == context.packageName) {
                        promise.resolve(true)
                        return
                    }
                }
            }
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Open the system Notification Listener Settings page.
     */
    @ReactMethod
    fun openNotificationListenerSettings() {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to general notification settings
            try {
                val intent = Intent(Settings.ACTION_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            } catch (e2: Exception) {
                // Last resort: open app settings
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            }
        }
    }

    /**
     * Get all pending transactions from SharedPreferences as a JSON string.
     */
    @ReactMethod
    fun getPendingTransactions(promise: Promise) {
        try {
            val json = prefs.getString(PREFS_KEY_TRANSACTIONS, "[]") ?: "[]"
            // Filter to only pending transactions
            val allTx = JSONArray(json)
            val pending = JSONArray()
            for (i in 0 until allTx.length()) {
                val tx = allTx.optJSONObject(i) ?: continue
                if (tx.optString("status", "pending") == "pending") {
                    pending.put(tx)
                }
            }
            promise.resolve(pending.toString())
        } catch (e: Exception) {
            promise.reject("ERR_GET_TRANSACTIONS", e.message, e)
        }
    }

    /**
     * Remove processed transactions by their IDs.
     */
    @ReactMethod
    fun clearProcessedTransactions(ids: ReadableArray, promise: Promise) {
        try {
            val idsToRemove = mutableSetOf<String>()
            for (i in 0 until ids.size()) {
                ids.getString(i)?.let { idsToRemove.add(it) }
            }

            val json = prefs.getString(PREFS_KEY_TRANSACTIONS, "[]") ?: "[]"
            val allTx = JSONArray(json)
            val remaining = JSONArray()

            for (i in 0 until allTx.length()) {
                val tx = allTx.optJSONObject(i) ?: continue
                val id = tx.optString("id", "")
                if (id !in idsToRemove) {
                    remaining.put(tx)
                }
            }

            prefs.edit()
                .putString(PREFS_KEY_TRANSACTIONS, remaining.toString())
                .apply()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_CLEAR_TRANSACTIONS", e.message, e)
        }
    }

    /**
     * Enable or disable transaction detection.
     */
    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        try {
            prefs.edit()
                .putBoolean(PREFS_KEY_ENABLED, enabled)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SET_ENABLED", e.message, e)
        }
    }

    /**
     * Check if detection is currently enabled.
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        try {
            promise.resolve(prefs.getBoolean(PREFS_KEY_ENABLED, false))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
