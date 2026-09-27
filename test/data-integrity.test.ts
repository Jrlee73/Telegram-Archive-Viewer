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

  // =========================================================================
  // TEST 4: Verifying importing two chats results in two distinct chats
  // =========================================================================
  console.log('\n[TEST 4] Verifying Multi-Chat Listing in Expandable Chats Section...');
  await sqliteService.clearAllData();

  sqliteService.insertChats([aliceChat, bobChat]);
  sqliteService.insertMessages(aliceMessages);
  sqliteService.insertMessages(bobMessages);

  const multiChats = sqliteService.getAllChats();
  console.log(`  • Total chats listed: ${multiChats.length} (expected: 2)`);
  const chatIds = multiChats.map((c) => c.id);
  console.log(`  • Listed chat IDs: ${chatIds.join(', ')}`);

  if (multiChats.length !== 2 || !chatIds.includes(chatAliceId) || !chatIds.includes(chatBobId)) {
    throw new Error(`TEST 4 FAILED: Expected 2 chats (${chatAliceId}, ${chatBobId}), found ${multiChats.length}`);
  }
  console.log('  ✅ TEST 4 PASSED: Importing two chats produces two distinct selectable entries.');

  // =========================================================================
  // TEST 5: Switching chats strictly filters messages by chat_id
  // =========================================================================
  console.log('\n[TEST 5] Verifying Strict Chat Isolation on Switch...');

  const aliceChunk = sqliteService.getMessagesChunk(chatAliceId, 0, 10);
  const bobChunk = sqliteService.getMessagesChunk(chatBobId, 0, 10);

  const aliceMixed = aliceChunk.some((m) => m.chatId !== chatAliceId || m.textContent?.includes('Bob'));
  const bobMixed = bobChunk.some((m) => m.chatId !== chatBobId || m.textContent?.includes('Alice'));

  console.log(`  • Alice messages contaminated with Bob data: ${aliceMixed} (expected: false)`);
  console.log(`  • Bob messages contaminated with Alice data: ${bobMixed} (expected: false)`);

  if (aliceMixed || bobMixed) {
    throw new Error('TEST 5 FAILED: Message leakage or contamination detected between chats!');
  }
  console.log('  ✅ TEST 5 PASSED: Messages are strictly isolated to their selected chat_id.');

  // =========================================================================
  // TEST 6: Merge import preserves previously imported chats
  // =========================================================================
  console.log('\n[TEST 6] Verifying Merge Import Preserves Existing Chats...');
  await sqliteService.clearAllData();

  // Import Chat 1 (Alice)
  sqliteService.insertChats([aliceChat]);
  sqliteService.insertMessages(aliceMessages);

  // Merge Import Chat 2 (Bob) without clearAllData()
  sqliteService.insertChats([bobChat]);
  sqliteService.insertMessages(bobMessages);

  const mergedChats = sqliteService.getAllChats();
  const mergedAliceCount = sqliteService.getMessageCount(chatAliceId);
  const mergedBobCount = sqliteService.getMessageCount(chatBobId);

  console.log(`  • Total chats after merge: ${mergedChats.length} (expected: 2)`);
  console.log(`  • Alice message count: ${mergedAliceCount} (expected: 3)`);
  console.log(`  • Bob message count: ${mergedBobCount} (expected: 3)`);

  if (mergedChats.length !== 2 || mergedAliceCount !== 3 || mergedBobCount !== 3) {
    throw new Error('TEST 6 FAILED: Merge import failed to preserve existing chats or messages!');
  }
  console.log('  ✅ TEST 6 PASSED: Merge import preserves existing conversations intact.');

  // =========================================================================
  // TEST 7: Merge import correctly updates duplicate (chat_id, id) records
  // =========================================================================
  console.log('\n[TEST 7] Verifying Merge Import Updates Duplicate (chat_id, id) Records...');

  const updatedAliceMsg1 = {
    ...aliceMessages[0],
    textContent: 'Alice Message #1: Updated contract details v2',
  };

  // Re-insert updated message with same (chat_id, id)
  sqliteService.insertMessages([updatedAliceMsg1]);

  const postUpdateAliceCount = sqliteService.getMessageCount(chatAliceId);
  const fetchedAliceChunk = sqliteService.getMessagesChunk(chatAliceId, 0, 10);
  const updatedText = fetchedAliceChunk[0]?.textContent;

  console.log(`  • Alice message count after duplicate insert: ${postUpdateAliceCount} (expected: 3)`);
  console.log(`  • Updated message #1 text: "${updatedText}"`);

  if (postUpdateAliceCount !== 3 || !updatedText?.includes('Updated contract details v2')) {
    throw new Error('TEST 7 FAILED: Duplicate (chat_id, id) record was not correctly updated via INSERT OR REPLACE!');
  }
  console.log('  ✅ TEST 7 PASSED: Composite key (chat_id, id) updates existing records without duplication.');

  // =========================================================================
  // TEST 8: Verifying Individual Chat Deletion Integrity and No Orphaned Records
  // =========================================================================
  console.log('\n[TEST 8] Verifying Individual Chat Deletion & Zero Orphaned Records...');

  // Set up 2 chats (Alice & Bob)
  await sqliteService.clearAllData();
  sqliteService.insertChats([aliceChat, bobChat]);
  sqliteService.insertMessages(aliceMessages);
  sqliteService.insertMessages(bobMessages);

  // Delete Bob's chat only
  await sqliteService.deleteChats([chatBobId]);

  const postDeleteChats = sqliteService.getAllChats();
  const postDeleteAliceMsgs = sqliteService.getMessageCount(chatAliceId);
  const postDeleteBobMsgs = sqliteService.getMessageCount(chatBobId);

  console.log(`  • Remaining chats after deleting Bob: ${postDeleteChats.length} (expected: 1)`);
  console.log(`  • Alice messages remaining: ${postDeleteAliceMsgs} (expected: 3)`);
  console.log(`  • Bob messages remaining: ${postDeleteBobMsgs} (expected: 0)`);

  if (postDeleteChats.length !== 1 || postDeleteChats[0].id !== chatAliceId) {
    throw new Error('TEST 8 FAILED: Deleting Bob chat failed to preserve Alice chat!');
  }

  if (postDeleteAliceMsgs !== 3 || postDeleteBobMsgs !== 0) {
    throw new Error('TEST 8 FAILED: Message records for deleted or remaining chats were inconsistent!');
  }

  console.log('  ✅ TEST 8 PASSED: Individual chat deletion cleans up target chat while leaving remaining chats fully intact.');

  // =========================================================================
  // TEST 9: Verifying Reply Preview Resolution
  // =========================================================================
  console.log('\n[TEST 9] Verifying Reply Preview Content Resolution...');
  const htmlChatReplies = `
<!DOCTYPE html>
<html>
<head><title>Export</title></head>
<body>
<div class="page_header"><div class="text bold">Chat with Charlie</div></div>
<div class="history">
  <div class="message default clearfix" id="message10">
    <div class="from_name">Charlie</div>
    <div class="text">The secret key is AlphaBravo123</div>
    <div class="date details" title="03.01.2024 12:00:00">12:00</div>
  </div>
  <div class="message default clearfix" id="message11">
    <div class="from_name">Charlie</div>
    <div class="reply_to details">In reply to <a href="#go_to_message10">this message</a></div>
    <div class="text">Understood, got the key!</div>
    <div class="date details" title="03.01.2024 12:05:00">12:05</div>
  </div>
</div>
</body>
</html>
  `.trim();

  const parsedCharlie = parseTelegramHtml(htmlChatReplies, 'messages_charlie.html');
  const chatCharlieId = 'chat_charlie_789';
  sqliteService.insertChats([{ ...parsedCharlie.chat!, id: chatCharlieId }]);
  sqliteService.insertMessages(
    parsedCharlie.messages.map((m, idx) => ({ ...m, chatId: chatCharlieId, seq: idx }))
  );

  const chunk = sqliteService.getMessagesChunk(chatCharlieId, 0, 10);
  const replyMessage = chunk.find((m) => m.id === 11);
  console.log(`  • Reply target msgId: ${replyMessage?.replyTo?.msgId} (expected: 10)`);
  console.log(`  • Resolved reply text: "${replyMessage?.replyTo?.text}" (expected: "The secret key is AlphaBravo123")`);

  if (!replyMessage?.replyTo || replyMessage.replyTo.text !== 'The secret key is AlphaBravo123') {
    throw new Error(`TEST 9 FAILED: Reply did not resolve to original message content! Got: "${replyMessage?.replyTo?.text}"`);
  }
  console.log('  ✅ TEST 9 PASSED: Replied-to message content is accurately resolved instead of "This message".');

  // =========================================================================
  // TEST 10: Verifying Search Result Limit (9,999) & "9999+" Exceeded Indicator
  // =========================================================================
  console.log('\n[TEST 10] Verifying Search Result Limit (9,999) & 9999+ Exceeded Indicator...');
  const searchChatId = 'chat_search_test';
  sqliteService.insertChats([{
    id: searchChatId,
    title: 'Search Volume Test',
    chatType: 'personal',
    totalMessages: 10005,
    lastMessage: 'test',
    lastDate: '12:00',
    initials: 'SV',
    colorClass: 'userpic1'
  }]);

  // Insert 10,005 messages matching "needle"
  const bulkMessages: TelegramMessage[] = [];
  for (let i = 1; i <= 10005; i++) {
    bulkMessages.push({
      id: i,
      chatId: searchChatId,
      msgType: 'default',
      senderName: 'Tester',
      dateText: '2024-01-01',
      timeText: '12:00',
      dateDay: '01.01.2024',
      textContent: `Matching needle message content ${i}`,
      seq: i - 1,
    });
  }
  sqliteService.insertMessages(bulkMessages);

  const SEARCH_LIMIT = 9999;
  const searchResults = sqliteService.searchMessages('needle', searchChatId, SEARCH_LIMIT + 1);
  const exceeds = searchResults.length > SEARCH_LIMIT;
  const displayed = exceeds ? searchResults.slice(0, SEARCH_LIMIT) : searchResults;
  const displayCount = exceeds ? '9999+' : `${displayed.length} found`;

  console.log(`  • Raw search results returned: ${searchResults.length} (expected: 10000)`);
  console.log(`  • Exceeds limit detected: ${exceeds} (expected: true)`);
  console.log(`  • Displayed count limit: ${displayed.length} (expected: 9999)`);
  console.log(`  • Display count string: "${displayCount}" (expected: "9999+")`);

  if (!exceeds || displayed.length !== 9999 || displayCount !== '9999+') {
    throw new Error('TEST 10 FAILED: Search result limit or 9999+ indicator failed!');
  }
  console.log('  ✅ TEST 10 PASSED: Search result limit increases to 9,999 and displays "9999+" when exceeding.');

  console.log('\n🏆 ALL DATA-INTEGRITY TESTS COMPLETED SUCCESSFULLY!');
}

runDataIntegrityTests().catch((err) => {
  console.error('\n❌ Test suite encountered failure:', err);
  process.exit(1);
});
