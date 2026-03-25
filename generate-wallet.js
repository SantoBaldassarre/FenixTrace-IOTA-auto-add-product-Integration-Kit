const { Ed25519Keypair } = require('@iota/iota-sdk/keypairs/ed25519');
const { decodeIotaPrivateKey } = require('@iota/iota-sdk/cryptography');
const { generateMnemonic } = require('@scure/bip39');
const { wordlist } = require('@scure/bip39/wordlists/english');
const fs = require('fs');
const path = require('path');

/**
 * Script to generate a new IOTA wallet and save the keys
 */
async function generateWallet() {
  try {
    console.log('🔐 Generating new IOTA wallet...');
    
    const mnemonic = generateMnemonic(wordlist, 256);
    const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
    const publicKey = keypair.getPublicKey();
    const address = publicKey.toIotaAddress?.() || publicKey.toSuiAddress?.() || publicKey.toAddress?.() || '';
    const publicKeyBytes = publicKey.toRawBytes ? publicKey.toRawBytes() : publicKey.toBytes?.();
    const bech32PrivateKey = keypair.getSecretKey();
    const decoded = decodeIotaPrivateKey(bech32PrivateKey);
    
    const walletData = {
      address,
      mnemonic,
      privateKey: `0x${Buffer.from(decoded.secretKey).toString('hex')}`,
      privateKeyBech32: bech32PrivateKey,
      publicKey: publicKeyBytes ? `0x${Buffer.from(publicKeyBytes).toString('hex')}` : undefined,
      createdAt: new Date().toISOString(),
      network: 'IOTA'
    };
    
    // File path in project root
    const walletFilePath = path.join(__dirname, 'wallet-keys.json');
    
    // Save wallet to JSON file
    fs.writeFileSync(walletFilePath, JSON.stringify(walletData, null, 2));
    
    console.log('✅ Wallet generated successfully!');
    console.log('📍 Address:', walletData.address);
    console.log('💾 Keys saved in:', walletFilePath);
    console.log('');
    console.log('⚠️  IMPORTANT: Keep private keys secure!');
    console.log('⚠️  Never share the private key or mnemonic phrase!');
    
    return walletData;
    
  } catch (error) {
    console.error('❌ Error during wallet generation:', error);
    throw error;
  }
}

// Execute script if called directly
if (require.main === module) {
  generateWallet()
    .then(() => {
      console.log('🎉 Process completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { generateWallet };
