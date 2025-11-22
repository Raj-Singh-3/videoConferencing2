export function randomRoomId() {
  // simple random room id (6 chars)
  return Math.random().toString(36).substring(2, 8);
}
