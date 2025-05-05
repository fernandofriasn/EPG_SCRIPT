const fs = require('fs');
const axios = require('axios');
const xmlbuilder = require('xmlbuilder');

// --- CONFIG ---
const m3uFilePath = './channels.m3u';
const epgApiUrl = 'http://10.0.0.221:3000/api/schedule';
const streamBaseUrl = 'http://10.0.0.215:5004/DaddyLive/watch/';
const channelIconUrl = 'https://i.imgur.com/iMFS9u4.jpeg'; // imagen común para todos

// --- Step 1: Parse M3U File ---
function parseM3U(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF')) {
      const nameMatch = lines[i].match(/tvg-name=['"]?([^'"]+)['"]?/);
      const idMatch = lines[i].match(/tvg-id=['"]?([^'"]+)['"]?/);
      const displayMatch = lines[i].split(',').pop().trim();
      const url = lines[i + 1]?.startsWith('http') ? lines[i + 1].trim() : null;

      if (nameMatch && idMatch) {
        channels.push({
          tvgName: nameMatch[1],
          tvgId: idMatch[1],
          displayName: displayMatch,
          streamUrl: `${streamBaseUrl}${idMatch[1]}`
        });
      }
    }
  }
  return channels;
}

// --- Step 2: Generate EPG XML ---
async function generateEPG() {
  try {
    const channels = parseM3U(m3uFilePath);
    const channelMap = Object.fromEntries(channels.map(c => [c.tvgName, c]));

    const response = await axios.get(epgApiUrl);
    const data = response.data;

    const tv = xmlbuilder.create('tv', { encoding: 'UTF-8' })
      .att('source-info-url', 'http://10.0.0.221')
      .att('source-data-url', epgApiUrl)
      .att('generator-info-name', 'Local EPG Generator')
      .att('generator-info-url', 'http://10.0.0.221');

    // <channel> entries
    for (const ch of channels) {
      const channel = tv.ele('channel', { id: ch.tvgId });
      channel.ele('display-name', {}, ch.displayName);
      channel.ele('display-name', {}, ch.tvgName);
      channel.ele('url', {}, ch.streamUrl);
      channel.ele('icon', { src: channelIconUrl }); // imagen aquí
    }

    // <programme> entries
    for (const category in data) {
      for (const event of data[category]) {
        const startParts = event.time.split(':');
        const start = new Date();
        start.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0, 0);
        const stop = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2 horas

        const formatDate = (date) =>
          date.toISOString().replace(/[-:]/g, '').split('.')[0] + ' +0000';

        for (const chName of event.channels) {
          const channel = channelMap[chName];
          if (channel) {
            const programme = tv.ele('programme', {
              start: formatDate(start),
              stop: formatDate(stop),
              channel: channel.tvgId
            });
            programme.ele('title', {}, event.event);
            programme.ele('desc', {}, `${category} - ${event.event}`);
            programme.ele('category', {}, category);
            // No se agrega imagen aquí
          }
        }
      }
    }

    const xml = tv.end({ pretty: true });
    fs.writeFileSync('./epg.xml', xml, 'utf-8');
    console.log('✅ EPG file generated successfully: epg.xml');
  } catch (error) {
    console.error('❌ Failed to generate EPG:', error.message);
  }
}

generateEPG();
