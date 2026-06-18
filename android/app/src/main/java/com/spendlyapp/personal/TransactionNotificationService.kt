package com.spendlyapp.personal

import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Android NotificationListenerService that intercepts notifications from
 * banking and UPI apps, parses transaction details, and stores them for
 * the React Native layer to consume.
 */
class TransactionNotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "TxnNotifService"
        private const val PREFS_NAME = "spendly_detected_transactions"
        private const val PREFS_KEY_TRANSACTIONS = "transactions"
        private const val PREFS_KEY_ENABLED = "detection_enabled"
        private const val MAX_STORED_TRANSACTIONS = 200

        // Package names of known banking/UPI apps
        val MONITORED_PACKAGES = setOf(
            // UPI Apps
            "com.google.android.apps.nbu.paisa.user",  // Google Pay
            "com.phonepe.app",                          // PhonePe
            "net.one97.paytm",                          // Paytm
            "in.org.npci.upiapp",                       // BHIM UPI
            "com.whatsapp",                             // WhatsApp Pay (notifications)

            // Banking Apps
            "com.sbi.SBIFreedomPlus",                   // SBI YONO
            "com.sbi.lotusintouch",                     // SBI YONO Lite
            "com.csam.icici.bank.imobile",              // ICICI iMobile
            "com.snapwork.hdfc",                        // HDFC MobileBanking
            "com.msf.kbank.mobile",                     // Kotak 811
            "com.axis.mobile",                          // Axis Mobile
            "com.bob.bobmobile",                        // Bank of Baroda
            "com.idbi.mpassbook",                       // IDBI Bank
            "com.pnb.android",                          // PNB ONE
            "com.canaaborbank.mobility",                // Canara Bank

            // Default messaging apps (for bank SMS alerts)
            "com.google.android.apps.messaging",        // Google Messages
            "com.samsung.android.messaging",            // Samsung Messages
            "com.android.mms",                          // Default Android SMS
        )
    }

    private lateinit var prefs: SharedPreferences

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        Log.d(TAG, "TransactionNotificationService created")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        // Check if detection is enabled
        if (!prefs.getBoolean(PREFS_KEY_ENABLED, false)) return

        val packageName = sbn.packageName ?: return

        // Only process notifications from monitored packages
        if (packageName !in MONITORED_PACKAGES) return

        // Extract notification text
        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""

        // Use the longest text available (bigText > text > title)
        val notificationText = when {
            bigText.isNotBlank() -> bigText
            text.isNotBlank() -> "$title $text"
            title.isNotBlank() -> title
            else -> return
        }

        Log.d(TAG, "Processing notification from $packageName: ${notificationText.take(100)}")

        // Parse the transaction
        val parsed = TransactionParser.parse(notificationText) ?: return

        // Only track debits for now (user expenses)
        if (parsed.type != "debit") {
            Log.d(TAG, "Skipping non-debit transaction: ${parsed.type}")
            return
        }

        // Create transaction JSON
        val transaction = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("amount", parsed.amount)
            put("merchant", parsed.merchant)
            put("transactionType", parsed.type)
            put("sourceApp", getAppLabel(packageName))
            put("rawText", parsed.rawText.take(500))
            put("detectedAt", System.currentTimeMillis())
            put("status", "pending")
        }

        // Check for duplicates before storing
        if (isDuplicate(transaction)) {
            Log.d(TAG, "Skipping duplicate transaction: ${parsed.amount} to ${parsed.merchant}")
            return
        }

        // Store the transaction
        storeTransaction(transaction)
        Log.i(TAG, "Detected transaction: ₹${parsed.amount} to ${parsed.merchant} via ${getAppLabel(packageName)}")
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No action needed when notifications are dismissed
    }

    /**
     * Check if a similar transaction already exists (same amount + merchant + same day).
     */
    private fun isDuplicate(newTx: JSONObject): Boolean {
        val existingJson = prefs.getString(PREFS_KEY_TRANSACTIONS, "[]") ?: "[]"
        val existing = try { JSONArray(existingJson) } catch (e: Exception) { JSONArray() }

        val newAmount = newTx.optDouble("amount", -1.0)
        val newMerchant = newTx.optString("merchant", "").lowercase()
        val newTime = newTx.optLong("detectedAt", 0)

        // Check within the last 24 hours
        val oneDayMs = 24 * 60 * 60 * 1000L

        for (i in 0 until existing.length()) {
            val tx = existing.optJSONObject(i) ?: continue
            val amount = tx.optDouble("amount", -2.0)
            val merchant = tx.optString("merchant", "").lowercase()
            val time = tx.optLong("detectedAt", 0)

            if (amount == newAmount &&
                merchant == newMerchant &&
                Math.abs(newTime - time) < oneDayMs) {
                return true
            }
        }

        return false
    }

    /**
     * Store a transaction in SharedPreferences.
     */
    private fun storeTransaction(transaction: JSONObject) {
        synchronized(this) {
            val existingJson = prefs.getString(PREFS_KEY_TRANSACTIONS, "[]") ?: "[]"
            val array = try { JSONArray(existingJson) } catch (e: Exception) { JSONArray() }

            // Add new transaction at the beginning
            val newArray = JSONArray()
            newArray.put(transaction)
            for (i in 0 until minOf(array.length(), MAX_STORED_TRANSACTIONS - 1)) {
                newArray.put(array.get(i))
            }

            prefs.edit()
                .putString(PREFS_KEY_TRANSACTIONS, newArray.toString())
                .apply()
        }
    }

    /**
     * Get a human-readable app label from a package name.
     */
    private fun getAppLabel(packageName: String): String {
        return when (packageName) {
            "com.google.android.apps.nbu.paisa.user" -> "Google Pay"
            "com.phonepe.app" -> "PhonePe"
            "net.one97.paytm" -> "Paytm"
            "in.org.npci.upiapp" -> "BHIM"
            "com.whatsapp" -> "WhatsApp"
            "com.sbi.SBIFreedomPlus", "com.sbi.lotusintouch" -> "SBI"
            "com.csam.icici.bank.imobile" -> "ICICI"
            "com.snapwork.hdfc" -> "HDFC"
            "com.msf.kbank.mobile" -> "Kotak"
            "com.axis.mobile" -> "Axis Bank"
            "com.bob.bobmobile" -> "Bank of Baroda"
            "com.idbi.mpassbook" -> "IDBI Bank"
            "com.pnb.android" -> "PNB"
            "com.canaaborbank.mobility" -> "Canara Bank"
            "com.google.android.apps.messaging" -> "Messages"
            "com.samsung.android.messaging" -> "Samsung Messages"
            "com.android.mms" -> "Messages"
            else -> {
                try {
                    packageManager.getApplicationLabel(
                        packageManager.getApplicationInfo(packageName, 0)
                    ).toString()
                } catch (e: Exception) {
                    packageName.split(".").lastOrNull() ?: "Unknown"
                }
            }
        }
    }
}
