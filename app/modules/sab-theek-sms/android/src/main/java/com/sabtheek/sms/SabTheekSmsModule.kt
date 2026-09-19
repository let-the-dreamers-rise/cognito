package com.sabtheek.sms

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Turns "a bank messaged this phone" into a timestamp, and nothing else.
 *
 * The privacy claim here is structural rather than a promise: the content
 * resolver projection below asks for ADDRESS and DATE only. Telephony.Sms.BODY
 * is never requested, so a message body never enters this process, let alone
 * leaves the device.
 */
class SabTheekSmsModule : Module() {

  /**
   * Indian bank and UPI senders use DLT headers like AD-HDFCBK or VM-SBIINB.
   * Matching on the sender alone is enough: we only need to know that a payment
   * happened, never what it was.
   */
  private val financialSenders = listOf(
    "HDFCBK", "SBIINB", "SBIUPI", "ICICIB", "AXISBK", "KOTAKB", "PNBSMS",
    "BOIIND", "CANBNK", "UNIONB", "IDFCFB", "YESBNK", "INDBNK", "BOBIBN",
    "PAYTMB", "PHONPE", "GOOGPY", "UPIBNK", "CENTBK", "IOBCHN"
  )

  private val permission = Manifest.permission.READ_SMS

  private fun granted(): Boolean {
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, permission) ==
      PackageManager.PERMISSION_GRANTED
  }

  override fun definition() = ModuleDefinition {
    Name("SabTheekSms")

    AsyncFunction("hasPermission") { granted() }

    AsyncFunction("requestPermission") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      if (granted()) return@AsyncFunction true
      ActivityCompat.requestPermissions(activity, arrayOf(permission), 4821)
      granted()
    }

    AsyncFunction("getTransactionTimestamps") { sinceEpochMs: Double ->
      if (!granted()) return@AsyncFunction emptyList<Double>()
      val resolver = appContext.reactContext?.contentResolver
        ?: return@AsyncFunction emptyList<Double>()

      // ADDRESS and DATE only. BODY is deliberately absent from this projection.
      val projection = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.DATE)
      val selection = "${Telephony.Sms.DATE} > ?"
      val args = arrayOf(sinceEpochMs.toLong().toString())

      val timestamps = mutableListOf<Double>()

      resolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        selection,
        args,
        "${Telephony.Sms.DATE} DESC"
      )?.use { cursor ->
        val addressColumn = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
        val dateColumn = cursor.getColumnIndex(Telephony.Sms.DATE)
        if (addressColumn < 0 || dateColumn < 0) return@use

        while (cursor.moveToNext()) {
          val sender = cursor.getString(addressColumn)?.uppercase() ?: continue
          if (financialSenders.any { sender.contains(it) }) {
            timestamps.add(cursor.getLong(dateColumn).toDouble())
          }
        }
      }

      timestamps
    }
  }
}
