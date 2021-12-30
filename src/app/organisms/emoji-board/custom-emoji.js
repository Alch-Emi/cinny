import { emojis } from './emoji';

// Custom emoji are stored in one of three places:
// - User emojis, which are stored in account data
// - Room emojis, which are stored in state events in a room
// - Emoji packs, which are rooms of emojis referenced in the account data or in a room's
//   cannonical space
//
// Emojis and packs referenced from within a user's account data should be available
// globally, while emojis and packs in rooms and spaces should only be available within
// those spaces and rooms

class ImagePack {
  // Convert a raw image pack into a more maliable format
  //
  // Takes an image pack event as per MSC 2545 (e.g. as in the Matrix spec), and converts
  // it to a format used here, while filling in defaults.
  //
  // The room argument is the room the pack exists in, which is used as a fallback for
  // missing properties
  //
  // Returns `null` if the rawPack is not a properly formatted image pack, although there
  // is still a fair amount of tolerance for malformed packs.
  static parsePack(rawPack, room) {
    if (typeof rawPack.content.images === 'undefined') {
      return null;
    }

    const pack = rawPack.content.pack ?? {};

    const displayName = pack.display_name ?? (room ? room.name : undefined);
    const avatar = pack.avatar_url ?? (room ? room.getMxcAvatarUrl() : undefined);
    const usage = pack.usage ?? ['emoticon', 'sticker'];
    const { attribution } = pack;
    const images = Object.entries(rawPack.content.images).flatMap((e) => {
      const data = e[1];
      const shortcode = e[0];
      const mxc = data.url;
      const body = data.body ?? shortcode;
      const { info } = data;
      const usage_ = data.usage ?? usage;

      if (mxc) {
        return [{
          shortcode, mxc, body, info, usage: usage_,
        }];
      }
      return [];
    });

    return new ImagePack(displayName, avatar, usage, attribution, images, rawPack);
  }

  constructor(displayName, avatar, usage, attribution, images, event) {
    this.displayName = displayName;
    this.avatar = avatar;
    this.usage = usage;
    this.attribution = attribution;
    this.images = images;
    this.event = event;
  }

  // Produce a list of emoji in this image pack
  getEmojis() {
    return this.images.filter((i) => i.usage.indexOf('emoticon') !== -1);
  }

  // Produce a list of stickers in this image pack
  getStickers() {
    return this.images.filter((i) => i.usage.indexOf('sticker') !== -1);
  }
}

// Retrieve a list of user emojis
//
// Result is an ImagePack, or null if the user hasn't set up or has deleted their personal
// image pack.
//
// Accepts a reference to a matrix client as the only argument
function getUserImagePack(mx) {
  const accountDataEmoji = mx.getAccountData('im.ponies.user_emotes');
  if (!accountDataEmoji) {
    return null;
  }

  const userImagePack = ImagePack.parsePack(accountDataEmoji.event);
  if (userImagePack) userImagePack.displayName ??= 'Your Emoji';
  return userImagePack;
}

// Produces a list of all of the emoji packs in a room
//
// Returns a list of `ImagePack`s.  This does not include packs in spaces that contain
// this room.
function getPacksInRoom(room) {
  const packs = room.currentState.getStateEvents('im.ponies.room_emotes');

  return packs
    .map((p) => ImagePack.parsePack(p.event, room))
    .filter((p) => p !== null);
}

// Produce a list of all packs from the user's image pack rooms.
//
// To be clear, these are image packs which are referenced by, but not embeded in, the
// user's account data.  From the users perspective, they joined a room and flipped a
// switch next to an image pack in that room, indicating that they want to be able to use
// that pack anywhere.  That pack will now be returned by this method.
//
// These packs MAY overlap with the packs returned by `getPacksInRoom()` if the user has
// enabled one of the packs in the current room.
//
// Currently, if the user is not in a room referenced by their account data (e.g. if they
// added a pack and then left the relevant room without disabling the pack), the pack will
// NOT be returned here.
//
// The only argument is a Matrix client
//
// An empty list will be returned if the user has not configured any image pack rooms.
function getFromImagePackRooms(mx) {
  const accountDataEvent = mx.getAccountData('im.ponies.emote_rooms') ?? { event: { content: {} } };
  const eventContent = accountDataEvent.event.content;
  const emoteRooms = eventContent.rooms ?? {};
  return Object.entries(emoteRooms)
    .flatMap(([roomId, keyObjects]) => {
      const keys = Object.keys(keyObjects);
      const room = mx.getRoom(roomId);
      if (room) {
        return getPacksInRoom(room)
          .filter((pack) => keys.indexOf(pack.event.state_key) !== -1);
      }
      return [];
    });
}

// Produce a list of all image packs which should be shown for a given room
//
// This includes packs in that room, the user's personal images, and will eventually
// include the user's enabled global image packs and space-level packs.
//
// This differs from getPacksInRoom, as the former only returns packs that are directly in
// a room, whereas this function returns all packs which should be shown to the user while
// they are in this room.
//
// Packs will be returned in the order that shortcode conflicts should be resolved, with
// higher priority packs coming first.
//
// Packs will be deduplicated if a pack appears more than once
function getRelevantPacks(room) {
  const packs = [].concat(
    getUserImagePack(room.client) ?? [],
    getPacksInRoom(room),
    getFromImagePackRooms(room.client),
  );
  const events = packs.map((pack) => pack.event.event_id);

  return packs.filter((pack, indx) => events.indexOf(pack.event.event_id) === indx);
}

// Returns all user+room emojis and all standard unicode emojis
//
// Accepts a reference to a matrix client as the only argument
//
// Result is a map from shortcode to the corresponding emoji.  If two emoji share a
// shortcode, only one will be presented, with priority given to custom emoji.
//
// Will eventually be expanded to include all emojis revelant to a room and the user
function getShortcodeToEmoji(room) {
  const allEmoji = new Map();

  emojis.forEach((emoji) => {
    if (emoji.shortcodes.constructor.name === 'Array') {
      emoji.shortcodes.forEach((shortcode) => {
        allEmoji.set(shortcode, emoji);
      });
    } else {
      allEmoji.set(emoji.shortcodes, emoji);
    }
  });

  getRelevantPacks(room).reverse()
    .flatMap((pack) => pack.getEmojis())
    .forEach((emoji) => {
      allEmoji.set(emoji.shortcode, emoji);
    });

  return allEmoji;
}

// Produces a special list of emoji specifically for auto-completion
//
// This list contains each emoji once, with all emoji being deduplicated by shortcode.
// However, the order of the standard emoji will have been preserved, and alternate
// shortcodes for the standard emoji will not be considered.
//
// Standard emoji are guaranteed to be earlier in the list than custom emoji
function getEmojiForCompletion(room) {
  const allEmoji = new Map();
  getRelevantPacks(room).reverse()
    .flatMap((pack) => pack.getEmojis())
    .forEach((emoji) => {
      allEmoji.set(emoji.shortcode, emoji);
    });

  return emojis.filter((e) => !allEmoji.has(e.shortcode))
    .concat(Array.from(allEmoji.values()));
}

export {
  getUserImagePack, getShortcodeToEmoji, getEmojiForCompletion, getPacksInRoom,
};
