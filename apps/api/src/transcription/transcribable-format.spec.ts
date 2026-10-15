import {
  isTranscribable,
  needsAudioExtraction,
} from './transcribable-format.js';

describe('isTranscribable', () => {
  it.each([
    ['rec.mp3', 'audio/mpeg'],
    ['REC.MP3', 'audio/mp3'],
    ['Запись встречи.mp3', 'audio/mpeg'],
    ['meeting.mp4', 'video/mp4'],
    ['MEETING.MP4', 'audio/mp4'],
  ])('%s (%s) расшифровывается', (name, mime) => {
    expect(isTranscribable(name, mime)).toBe(true);
  });

  it.each([
    ['doc.pdf', 'application/pdf'],
    ['rec.wav', 'audio/wav'],
    ['rec', 'audio/mpeg'],
    ['rec.mp3', 'application/pdf'],
    ['rec.mp3', 'application/octet-stream'],
    ['rec.mp3.exe', 'audio/mpeg'],
    ['meeting.mp4', 'audio/mpeg'],
    ['meeting.mp4', 'application/octet-stream'],
    ['meeting.mov', 'video/quicktime'],
    ['meeting.webm', 'video/webm'],
  ])('%s (%s) не расшифровывается', (name, mime) => {
    expect(isTranscribable(name, mime)).toBe(false);
  });
});

describe('needsAudioExtraction', () => {
  it('только mp4 требует извлечения звука', () => {
    expect(needsAudioExtraction('a.mp4')).toBe(true);
    expect(needsAudioExtraction('A.MP4')).toBe(true);
    expect(needsAudioExtraction('a.mp3')).toBe(false);
  });
});
