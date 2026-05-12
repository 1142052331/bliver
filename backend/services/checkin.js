const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { reverseGeocode } = require('./nominatim');
const { getWeather } = require('./weather');
const { blurCoordinate } = require('./location');
const { populateFootprint } = require('./footprint');

async function checkIn(userId, { lat, lng, message, mood, precise, photoUrl }) {
  const displayLocation = precise
    ? { lat, lng }
    : blurCoordinate(lat, lng);

  const [placeName, weatherData] = await Promise.all([
    reverseGeocode(displayLocation.lat, displayLocation.lng),
    getWeather(lat, lng),
  ]);

  const weatherLine = weatherData.weather
    ? `🌤 ${weatherData.weather}  ${weatherData.temp !== null ? weatherData.temp + '°C' : ''}`
    : '';

  const footprintData = {
    userId,
    location: displayLocation,
    placeName,
    message: [weatherLine, message || ''].filter(Boolean).join('\n'),
    photoUrl: photoUrl || '',
    mood: mood || '',
  };

  if (!precise) {
    footprintData.realLocation = { lat, lng };
  }

  const footprint = await Footprint.create(footprintData);

  // Update daily check-in streak (two-phase atomic)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const incResult = await User.findOneAndUpdate(
    { _id: userId, 'checkinStreak.lastCheckinDate': yesterday },
    { $inc: { 'checkinStreak.current': 1 }, $set: { 'checkinStreak.lastCheckinDate': today } }
  );

  if (!incResult) {
    await User.findOneAndUpdate(
      { _id: userId, 'checkinStreak.lastCheckinDate': { $ne: today } },
      { $set: { 'checkinStreak': { current: 1, lastCheckinDate: today } } }
    );
  }

  const populated = await populateFootprint(Footprint.findById(footprint._id));
  return populated.toObject();
}

module.exports = { checkIn };
