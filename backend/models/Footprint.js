const mongoose = require('mongoose');

const footprintSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location:  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  realLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },
  placeName: { type: String, default: '' },
  message:   { type: String, default: '' },
  mood:      { type: String, default: '' },
  photoUrl:  { type: String, default: '' },
  reactions: [{
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    emoji:    { type: String, required: true },
  }],
  comments:  [{
    username:  { type: String, required: true },
    content:   { type: String, required: true },
    ipAddress: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Footprint', footprintSchema);
