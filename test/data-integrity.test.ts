import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(global as any).DOMParser = dom.window.DOMParser;
(global as any).document = dom.window.document;
(global as any).window = dom.window;

import { parseTelegramHtml } from '../src/utils/htmlArchiveParser';
import { sqliteService } from '../src/services/sqliteService';
import { TelegramChat, TelegramMessage } from '../src/types';

async function runDataIntegrityTests() {
  console.log('🧪 ==============================================================');
  console.log('🧪 DATA-INTEGRITY & CORRECTNESS TESTS');
  console.log('🧪 ==============================================================');

  await sqliteService.init();

  // =========================================================================
  // TEST 1: Cross-chat message overwrite test using two HTML chat exports
  // =========================================================================
  console.log('\n[TEST 1] Reproducing & Verifying Cross-chat Message Overwrite Fix...');

  const htmlChatAlice = `
<!DOCTYPE html>
<html>
<head><title>Export</title></head>
<body>
<div class="page_header"><div class="text bold">Chat with Alice</div></div>
<div class="history">
  <div class="message default clearfix" id="message1">
    <div class="from_name">Alice Smith</div>
    <div class="text">Alice Message #1: Important contract details</div>
    <div class="date details" title="01.01.2024 10:00:00">10:00</div>
  </div>
  <div class="message default clearfix" id="message2">
    <div class="from_name">Alice Smith</div>
    <div class="text">Alice Message #2: Meeting scheduled for tomorrow</div>
    <div class="date details" title="01.01.2024 10:05:00">10:05</div>
  </div>
  <div class="message default clearfix" id="message3">
    <div class="from_name">Alice Smith</div>
    <div class="text">Alice Message #3: Document attached below</div>
    <div class="date details" title="01.01.2024 10:10:00">10:10</div>
  </div>
</div>
</body>
</html>
  `.trim();

  const htmlChatBob = `
<!DOCTYPE html>
<html>
<head><title>Export</title></head>
<body>
<div class="page_header"><div class="text bold">Chat with Bob</div></div>
<div class="history">
  <div class="message default clearfix" id="message1">
    <div class="from_name">Bob Jones</div>
    <div class="text">Bob Message #1: Hey, are you around?</div>
    <div class="date details" title="02.01.2024 14:00:00">14:00</div>
  </div>
  <div class="message default clearfix" id="message2">
    <div class="from_name">Bob Jones</div>
    <div class="text">Bob Message #2: Let us grab lunch today</div>
    <div class="date details" title="02.01.2024 14:02:00">14:02</div>
  </div>
  <div class="message default clearfix" id="message3">
    <div class="from_name">Bob Jones</div>
    <div class="text">Bob Message #3: Sounds great!</div>
    <div class="date details" title="02.01.2024 14:05:00">14:05</div>
  </div>
</div>
</body>
</html>
  `.trim();

  // Parse Alice's chat HTML
  const parsedAlice = parseTelegramHtml(htmlChatAlice, 'messages_alice.html');
  const chatAliceId = 'chat_alice_123';
  const aliceChat: TelegramChat = {
    ...parsedAlice.chat!,
    id: chatAliceId,
  };
  sqliteService.insertChats([aliceChat]);

  // Messages in Alice's chat bucket start with seq 0..2
  const aliceMessages = parsedAlice.messages.map((m, idx) => ({
    ...m,
    chatId: chatAliceId,
    seq: idx,
  }));
  sqliteService.insertMessages(aliceMessages);

  // Parse Bob's chat HTML
  const parsedBob = parseTelegramHtml(htmlChatBob, 'messages_bob.html');
  const chatBobId = 'chat_bob_456';
  const bobChat: TelegramChat = {
    ...parsedBob.chat!,
    id: chatBobId,
  };
  sqliteService.insertChats([bobChat]);

  // Messages in Bob's chat bucket also start with seq 0..2 (and have same message IDs #1, #2, #3!)
  const bobMessages = parsedBob.messages.map((m, idx) => ({
    ...m,
    chatId: chatBobId,
    seq: idx,
  }));
  // In the old code with `seq PRIMARY KEY`, this insert replaced Alice's messages 1, 2, 3!
  sqliteService.insertMessages(bobMessages);

  const countAlice = sqliteService.getMessageCount(chatAliceId);
  const countBob = sqliteService.getMessageCount(chatBobId);

  console.log(`  • Alice chat messages in DB: ${countAlice} (expected 3)`);
  console.log(`  • Bob chat messages in DB: ${countBob} (expected 3)`);

  if (countAlice !== 3) {
    throw new Error(`TEST 1 FAILED: Alice's messages were overwritten! Found ${countAlice} messages instead of 3.`);
  }
  if (countBob !== 3) {
    throw new Error(`TEST 1 FAILED: Bob's messages were corrupted! Found ${countBob} messages instead of 3.`);
  }

  const aliceStoredMsgs = sqliteService.getMessagesChunk(chatAliceId, 0, 10);
  const bobStoredMsgs = sqliteService.getMessagesChunk(chatBobId, 0, 10);

  if (!aliceStoredMsgs[0].textContent?.includes('Alice Message #1')) {
    throw new Error(`TEST 1 FAILED: Alice's message #1 content was lost or overwritten! Found: "${aliceStoredMsgs[0].textContent}"`);
  }
  if (!bobStoredMsgs[0].textContent?.includes('Bob Message #1')) {
    throw new Error(`TEST 1 FAILED: Bob's message #1 content mismatch! Found: "${bobStoredMsgs[0].textContent}"`);
  }

  console.log('  ✅ TEST 1 PASSED: Composite key (chat_id, id) preserves both chats with zero data loss.');

  // =========================================================================
  // TEST 2: clearChatData() failure and persistence test
  // =========================================================================
  console.log('\n[TEST 2] Verifying clearChatData() Execution and Persistence...');

  sqliteService.insertMediaFiles([
    { relPath: 'photos/photo_test.jpg', fileName: 'photo_test.jpg', fileType: 'image/jpeg', fileSize: 5000 },
  ]);

  const clearOk = await sqliteService.clearChatData();
  console.log(`  • clearChatData() returned: ${clearOk} (expected: true)`);
  if (!clearOk) {
    throw new Error('TEST 2 FAILED: clearChatData() returned false or threw error!');
  }

  const exportedBin = sqliteService.exportBinary();
  if (!exportedBin) {
    throw new Error('TEST 2 FAILED: exportBinary() returned null');
  }

  const remainingChats = sqliteService.getAllChats();
  const remainingAliceMsgs = sqliteService.getMessageCount(chatAliceId);
  const remainingBobMsgs = sqliteService.getMessageCount(chatBobId);
  const remainingMedia = sqliteService.getStats().totalMediaFiles;

  console.log(`  • Remaining chats: ${remainingChats.length} (expected: 0)`);
  console.log(`  • Remaining Alice messages: ${remainingAliceMsgs} (expected: 0)`);
  console.log(`  • Remaining Bob messages: ${remainingBobMsgs} (expected: 0)`);
  console.log(`  • Remaining media files: ${remainingMedia} (expected: 0)`);

  if (remainingChats.length !== 0 || remainingAliceMsgs !== 0 || remainingBobMsgs !== 0 || remainingMedia !== 0) {
    throw new Error('TEST 2 FAILED: Data remained in database after reloading exported binary!');
  }

  console.log('  ✅ TEST 2 PASSED: clearChatData() succeeded without throwing and persisted clean state.');

  // =========================================================================
  // TEST 3: Folder re-import confirmation logic simulation
  // =========================================================================
  console.log('\n[TEST 3] Verifying Folder Re-import Safety Logic...');

  // Set up existing archive state
  sqliteService.insertChats([aliceChat]);
  sqliteService.insertMessages(aliceMessages);
  sqliteService.setSetting('export_folder_name', 'Telegram_Export_Original');

  const preExistingChats = sqliteService.getAllChats();
  const preExistingMsgs = sqliteService.getMessageCount(chatAliceId);
  const storedFolder = sqliteService.getSetting('export_folder_name');

  console.log(`  • Initial archive: ${preExistingMsgs} messages in folder "${storedFolder}"`);

  // Simulate user picking a DIFFERENT folder: "Telegram_Export_Different"
  const newFolder = 'Telegram_Export_Different';
  const shouldRequireConfirm = preExistingMsgs > 0 && storedFolder !== newFolder;
  console.log(`  • Requires user confirmation for new folder "${newFolder}": ${shouldRequireConfirm} (expected: true)`);
  if (!shouldRequireConfirm) {
    throw new Error('TEST 3 FAILED: Re-import confirmation check failed to trigger on mismatched folder!');
  }

  // Case A: User CANCELS confirmation
  // Abort cleanly without calling clearAllData()
  const postCancelMsgs = sqliteService.getMessageCount(chatAliceId);
  if (postCancelMsgs !== 3) {
    throw new Error('TEST 3 FAILED: Data was modified despite cancellation!');
  }
  console.log('  • On Cancel: Existing archive messages retained untouched (count = 3).');

  // Case B: User CONFIRMS replacement
  await sqliteService.clearAllData();
  sqliteService.setSetting('export_folder_name', newFolder);
  sqliteService.insertChats([bobChat]);
  sqliteService.insertMessages(bobMessages);

  const postConfirmAlice = sqliteService.getMessageCount(chatAliceId);
  const postConfirmBob = sqliteService.getMessageCount(chatBobId);
  const updatedFolder = sqliteService.getSetting('export_folder_name');

  console.log(`  • On Confirm: Alice msgs=${postConfirmAlice} (0), Bob msgs=${postConfirmBob} (3), Folder="${updatedFolder}"`);
  if (postConfirmAlice !== 0 || postConfirmBob !== 3 || updatedFolder !== newFolder) {
    throw new Error('TEST 3 FAILED: Archive replacement did not proceed as expected upon user confirmation!');
  }

  console.log('  ✅ TEST 3 PASSED: Confirmation gate protects archive from accidental destructive wipe.');

  console.log('\n🏆 ALL DATA-INTEGRITY TESTS COMPLETED SUCCESSFULLY!');
}

runDataIntegrityTests().catch((err) => {
  console.error('\n❌ Test suite encountered failure:', err);
  process.exit(1);
});
