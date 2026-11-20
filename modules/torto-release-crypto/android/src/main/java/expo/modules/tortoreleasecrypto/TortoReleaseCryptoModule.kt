package expo.modules.tortoreleasecrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.interfaces.RSAPublicKey
import java.security.spec.MGF1ParameterSpec
import java.security.spec.PSSParameterSpec
import java.security.spec.X509EncodedKeySpec

class TortoReleaseCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TortoReleaseCrypto")
    AsyncFunction("sha256") { content: String ->
      ReleaseCrypto.sha256(content)
    }
    AsyncFunction("nonce") {
      val bytes = ByteArray(32)
      SecureRandom().nextBytes(bytes)
      ReleaseCrypto.hex(bytes)
    }
    AsyncFunction("verifyRsaPss") { spkiHex: String, payload: String, signatureHex: String ->
      ReleaseCrypto.verify(spkiHex, payload, signatureHex)
    }
  }
}

internal object ReleaseCrypto {
  fun sha256(content: String) = hex(MessageDigest.getInstance("SHA-256").digest(content.toByteArray(Charsets.UTF_8)))
  fun verify(spkiHex: String, payload: String, signatureHex: String): Boolean {
      val key = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(unhex(spkiHex))) as RSAPublicKey
      require(key.modulus.bitLength() >= 2048) { "RSA key too short" }
      // Do not use PSS defaults: Android defaults may use SHA-1/MGF1-SHA1.
      val verifier = Signature.getInstance("SHA256withRSA/PSS")
      verifier.setParameter(PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1))
      verifier.initVerify(key)
      verifier.update(payload.toByteArray(Charsets.UTF_8))
      return verifier.verify(unhex(signatureHex))
  }
  fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun unhex(value: String): ByteArray {
    require(value.isNotEmpty() && value.length % 2 == 0 && value.matches(Regex("[0-9a-fA-F]+"))) { "Invalid hex" }
    return ByteArray(value.length / 2) { value.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  }
}
