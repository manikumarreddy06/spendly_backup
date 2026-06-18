package com.spendlyapp.personal

import android.util.Log

/**
 * Parses bank/UPI notification text to extract transaction details.
 * Supports common Indian bank formats, UPI apps, and credit card alerts.
 */
object TransactionParser {

    private const val TAG = "TransactionParser"

    data class ParsedTransaction(
        val amount: Double,
        val merchant: String,
        val type: String, // "debit" or "credit"
        val rawText: String
    )

    // Patterns ordered by specificity (most specific first)
    private val PATTERNS = listOf(
        // UPI payment patterns: "Paid ₹250 successfully to SWIGGY" / "Sent ₹120 to Uber"
        Pattern(
            regex = Regex(
                """(?:Paid|Sent|Payment of)\s*(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:successfully|successful)?\s*(?:to|for)\s+(.+?)(?:\s+using|\s+via|\s+on|\s+from|\s+ref|\.|$|,)""",
                RegexOption.IGNORE_CASE
            ),
            type = "debit",
            amountGroup = 1,
            merchantGroup = 2
        ),
        // "₹250 paid successfully to SWIGGY" format
        Pattern(
            regex = Regex(
                """(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:paid|sent|transferred)\s*(?:successfully|successful)?\s*(?:to|for)\s+(.+?)(?:\s+using|\s+via|\s+on|\s+from|\s+ref|\.|$|,)""",
                RegexOption.IGNORE_CASE
            ),
            type = "debit",
            amountGroup = 1,
            merchantGroup = 2
        ),
        // Bank debit (verb after amount): "Rs.500 debited from A/c XXXX1234"
        Pattern(
            regex = Regex(
                """(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been |is |was )?(?:debited|withdrawn|deducted|spent)\s*(?:from|in|at|on)?\s*(?:A/?c|account|card)?\s*(?:X{2,}\d+|\*\d+|ending\s*\d+)?\s*(?:at|to|for|on)?\s*(.+?)(?:\s+on|\s+at|\s+ref|\s+Info|\.|$|,)""",
                RegexOption.IGNORE_CASE
            ),
            type = "debit",
            amountGroup = 1,
            merchantGroup = 2
        ),
        // Bank debit (verb before amount): "Union Bank of India A/c *4954 Debited Rs:1.00 ... Fvg: AVULA CH"
        // Handles: "Debited Rs. 500", "Debited Rs:1.00", "debited by Rs.1.00"
        Pattern(
            regex = Regex(
                """(?:debited|withdrawn|spent|deducted)\s*(?:by|with|for|of)?\s*(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)(?:.*?(?:Fvg:?|Favouring:?|to|at|for)\s+(.+?)(?:\s+Avl|\s+Bal|\s+ref|\s+on|\s+dated|\.|$|,))?""",
                RegexOption.IGNORE_CASE
            ),
            type = "debit",
            amountGroup = 1,
            merchantGroup = 2
        ),
        // Credit card transaction: "Transaction of Rs.999 at AMAZON"
        Pattern(
            regex = Regex(
                """(?:Transaction|Txn|Purchase)\s*(?:of\s*)?(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:at|on|for|with)\s+(.+?)(?:\s+on|\s+dated|\s+ref|\.|$|,)""",
                RegexOption.IGNORE_CASE
            ),
            type = "debit",
            amountGroup = 1,
            merchantGroup = 2
        ),
        // Generic amount with "debited" keyword (fallback)
        Pattern(
            regex = Regex(
                """(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been |is |was )?debited""",
                RegexOption.IGNORE_CASE
            ),
            type = "debit",
            amountGroup = 1,
            merchantGroup = -1 // No merchant in this pattern
        ),
        // UPI credit: "Received ₹500 from John"
        Pattern(
            regex = Regex(
                """(?:Received|Credited)\s*(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:from|by)\s+(.+?)(?:\s+on|\s+ref|\.|$|,)""",
                RegexOption.IGNORE_CASE
            ),
            type = "credit",
            amountGroup = 1,
            merchantGroup = 2
        ),
        // Bank credit: "Rs.5000 credited to A/c"
        Pattern(
            regex = Regex(
                """(?:Rs\.?|₹|INR|Rs:)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been |is |was )?credited""",
                RegexOption.IGNORE_CASE
            ),
            type = "credit",
            amountGroup = 1,
            merchantGroup = -1
        )
    )

    // Keywords that indicate this is NOT a financial transaction
    private val EXCLUDE_KEYWORDS = listOf(
        "otp", "one time password", "verification code",
        "login", "password reset", "promo", "offer",
        "cashback earned", "reward", "points",
        "bill generated", "statement ready",
        "emi due", "payment due", "minimum due"
    )

    /**
     * Parse notification text and extract transaction details.
     * Returns null if the text is not a valid financial transaction.
     */
    fun parse(text: String): ParsedTransaction? {
        if (text.isBlank()) return null

        val lowerText = text.lowercase()

        // Skip non-transaction notifications
        if (EXCLUDE_KEYWORDS.any { lowerText.contains(it) }) {
            Log.d(TAG, "Skipping non-transaction: contains excluded keyword")
            return null
        }

        for (pattern in PATTERNS) {
            val match = pattern.regex.find(text) ?: continue

            try {
                val amountStr = match.groupValues[pattern.amountGroup]
                    .replace(",", "")
                    .trim()
                val amount = amountStr.toDoubleOrNull() ?: continue

                // Skip very small or very large amounts (likely false positives)
                if (amount < 1.0 || amount > 10_000_000.0) continue

                val merchant = if (pattern.merchantGroup > 0 && pattern.merchantGroup < match.groupValues.size) {
                    cleanMerchantName(match.groupValues[pattern.merchantGroup])
                } else {
                    "Unknown"
                }

                Log.d(TAG, "Parsed: amount=$amount, merchant=$merchant, type=${pattern.type}")

                return ParsedTransaction(
                    amount = amount,
                    merchant = merchant,
                    type = pattern.type,
                    rawText = text
                )
            } catch (e: Exception) {
                Log.w(TAG, "Error parsing pattern match: ${e.message}")
                continue
            }
        }

        return null
    }

    /**
     * Clean up merchant name: trim whitespace, remove trailing reference numbers, etc.
     */
    private fun cleanMerchantName(raw: String): String {
        var name = raw.trim()

        // Remove trailing reference numbers like "Ref:12345" or "UPI:12345"
        name = name.replace(Regex("""(?:\s+(?:Ref|UPI|NEFT|IMPS|RTGS)[:\s]*\S+)$""", RegexOption.IGNORE_CASE), "")

        // Remove trailing account numbers
        name = name.replace(Regex("""\s*(?:A/?c|account)\s*(?:X{2,}\d+|\d{4,}).*$""", RegexOption.IGNORE_CASE), "")

        // Remove trailing dots, dashes, spaces
        name = name.trimEnd('.', '-', ' ', ',')

        // Capitalize first letter of each word
        name = name.split(" ").joinToString(" ") { word ->
            if (word.length <= 2) word.uppercase()
            else word.lowercase().replaceFirstChar { it.uppercase() }
        }

        return if (name.isBlank()) "Unknown" else name
    }

    private data class Pattern(
        val regex: Regex,
        val type: String,
        val amountGroup: Int,
        val merchantGroup: Int
    )
}
