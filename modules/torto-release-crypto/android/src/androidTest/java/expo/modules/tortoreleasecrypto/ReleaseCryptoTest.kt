package expo.modules.tortoreleasecrypto

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.MGF1ParameterSpec
import java.security.spec.PSSParameterSpec

/** Runs on Android's actual JCA provider. No fixture key is bundled in the app. */
@RunWith(AndroidJUnit4::class)
class ReleaseCryptoTest {
  @Test fun digestAndPssParameters() {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", ReleaseCrypto.sha256("abc"))
    val generator = KeyPairGenerator.getInstance("RSA")
    generator.initialize(2048)
    val pair = generator.generateKeyPair()
    val signer = Signature.getInstance("SHA256withRSA/PSS")
    signer.setParameter(PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1))
    signer.initSign(pair.private)
    signer.update("test-only".toByteArray(Charsets.UTF_8))
    val signature = ReleaseCrypto.hex(signer.sign())
    val publicKey = ReleaseCrypto.hex(pair.public.encoded)
    assertTrue(ReleaseCrypto.verify(publicKey, "test-only", signature))
    assertFalse(ReleaseCrypto.verify(publicKey, "altered", signature))
    val other = generator.generateKeyPair()
    assertFalse(ReleaseCrypto.verify(ReleaseCrypto.hex(other.public.encoded), "test-only", signature))
  }
}
