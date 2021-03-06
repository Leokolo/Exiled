/****************************
 * Friends Plug-in for PS	*
 * Created by: Insist		*
 ****************************/

"use strict";

const FS = require("../lib/fs.js");

let friends = FS("config/friends.json").readIfExistsSync();

if (friends !== "") {
	friends = JSON.parse(friends);
} else {
	friends = {};
}

function write() {
	FS("config/friends.json").writeUpdate(() => (
		JSON.stringify(friends)
	));
	let data = "{\n";
	for (let u in friends) {
		data += '\t"' + u + '": ' + JSON.stringify(friends[u]) + ",\n";
	}
	data = data.substr(0, data.length - 2);
	data += "\n}";
	FS("config/friends.json").writeUpdate(() => (
		data
	));
}

function checkFriends(userid, user) {
	if (!friends[userid]) return false;
	let onlineUsers = [];
	friends[userid].friendsList.forEach(online => {
		if (Users.get(online) && Users.get(online).connected) {
			onlineUsers.push(online);
		}
	});
	if (onlineUsers.length > 0 && friends[userid].notifications) user.send(`|pm|~${Config.serverName} Friend Manager|${user.getIdentity()}|/raw ${onlineUsers.length} of your friends are online: ${Chat.toListString(onlineUsers)} are online.<hr /><center><button class= "button" name= "send" value= "/friend togglenotifications">${(friends[userid].notifications ? "Remove Notifications" : "Turn On Notifications")}</button></center><hr />`);
	for (let friend of onlineUsers) {
		if (friends[friend].notifications && !friends[friend].ignoreList.includes(userid)) Users(friend).send(`|pm|~${Config.serverName} Friend Manager|${Users(friend).getIdentity()}|/raw Your friend ${Server.nameColor(userid, true, true)} has just came online.<hr /><center><button class= "button" name= "send" value="/friend ignore ${userid}">Ignore Notifications from ${userid}</button><button class= "button" name= "send" value= "/friend togglenotifications">${(friends[userid].notifications ? "Remove Notifications" : "Turn On Notifications")}</button></center><hr />`);
	}
}
Server.checkFriends = checkFriends;

function getLastSeen(userid) {
	if (Users(userid) && Users(userid).connected) return `<font color = "limegreen"><strong>Currently Online</strong></font>`;
	let seen = Db.seen.get(userid);
	if (!seen) return `<font color = "red"><strong>Never</strong></font>`;
	return `${Chat.toDurationString(Date.now() - seen, {precision: true})} ago.`;
}

for (let f in friends) {
	if (!friends[f].private) friends[f].private = false;
	if (!friends[f].notifications) friends[f].notifications = true;
	if (!friends[f].disabledFriends) friends[f].disabledFriends = false;
	if (!friends[f].ignoreList) friends[f].ignoreList = [];
}
write();

exports.commands = {
	fren: "friends",
	frens: "friends",
	friend: "friends",
	friends: {
		init: function (target, room, user) {
			if (user.locked || !user.autoconfirmed) return this.errorReply(`To prevent spamming you must be on an autoconfirmed account and unlocked to send friend requests.`);
			if (friends[user.userid]) return this.errorReply(`You have already initalized your friends list.`);
			friends[user.userid] = {
				friendsList: [],
				pendingRequests: [],
				notifications: true,
				disabledFriends: false,
				ignoreList: [], // Allow users to ignore certain friends from their notifications (helpful when they DC a lot)
				private: false,
			};
			write();
			return this.sendReply(`You have successfully initialized your friends list.`);
		},

		send: "add",
		sendrequest: "add",
		request: "add",
		add: function (target, room, user) {
			if (!target || target.length < 1 || target.length > 18) return this.parse(`/help friends`);
			let targetUser = Users(target);
			if (!targetUser || !targetUser.connected) return this.errorReply(`${target} is not online.`);
			// If the user has not initalized their friends list, parse /friends init
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (user.userid === targetUser.userid) return this.errorReply(`Like I can relate and all... but apparently being your own friend is invalid.`);
			if (user.locked || !user.autoconfirmed) return this.errorReply(`To prevent spamming you must be on an autoconfirmed account and unlocked to send friend requests.`);
			if (friends[targetUser.userid].disabledFriends) return this.errorReply(`${targetUser} has disabled adding friends.`);
			if (friends[user.userid].disabledFriends) return this.errorReply(`You must enable friend requests before attempting to add others.`);
			if (friends[targetUser.userid] && friends[targetUser.userid].pendingRequests.includes(user.userid)) return this.parse(`/friends accept ${targetUser}`);
			if (friends[user.userid].pendingRequests.includes(targetUser.userid)) return this.errorReply(`${targetUser} already has a pending request from you.`);
			if (friends[user.userid].friendsList.includes(targetUser.userid)) return this.errorReply(`${targetUser} is already registered on your friends list.`);
			friends[user.userid].pendingRequests.push(targetUser.userid);
			write();
			let message = `/html has sent you a friend request. <br /><button name="send" value="/friends accept ${user.userid}">Click to accept</button> | <button name="send" value="/friends decline ${user.userid}">Click to decline</button>`;
			targetUser.send(`|pm|${user.getIdentity()}|${targetUser.getIdentity()}|${message}`);
			return this.sendReply(`You have sent ${targetUser.name} a friend request.`);
		},

		removefriend: "remove",
		unfriend: "remove",
		remove: function (target, room, user) {
			if (!target) return this.parse(`/help friends`);
			let targetId = toId(target);
			if (!friends[user.userid].friendsList.includes(targetId)) return this.errorReply(`${target} is not registered as your friend.`);
			friends[user.userid].friendsList.splice(friends[user.userid].friendsList.indexOf(targetId), 1);
			friends[targetId].friendsList.splice(friends[targetId].friendsList.indexOf(user.userid), 1);
			// Check if the user or the target has each other on their ignore list and if so remove it
			if (friends[user.userid].ignoreList.includes(targetId)) friends[user.userid].ignoreList.splice(friends[user.userid].ignoreList.indexOf(targetId), 1);
			if (friends[targetId].ignoreList.includes(user.userid)) friends[targetId].ignoreList.splice(friends[targetId].ignoreList.indexOf(user.userid), 1);
			write();
			return this.sendReply(`You have successfully removed ${target} as a friend.`);
		},

		approve: "accept",
		accept: function (target, room, user) {
			if (user.locked || !user.autoconfirmed) return this.errorReply(`To prevent spamming you must be on an autoconfirmed account and unlocked to send friend requests.`);
			if (!target) return this.parse(`/help friends`);
			let targetId = toId(target);
			// If the user has not initalized their friends list, parse /friends init
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (!friends[targetId].pendingRequests.includes(user.userid)) return this.errorReply(`${target} has not sent you a friend request.`);
			friends[targetId].friendsList.push(user.userid);
			friends[user.userid].friendsList.push(targetId);
			friends[targetId].pendingRequests.splice(friends[targetId].pendingRequests.indexOf(user.userid), 1);
			write();
			if (Users(targetId) && Users(targetId).connected) Users(targetId).send(`|pm|${user.getIdentity}|${Users(targetId).getIdentity()}|/raw ${Server.nameColor(user.name, true, true)} has accepted your friend request.`);
			return this.sendReply(`You have successfully accepted ${target}'s friend request.`);
		},

		decline: "deny",
		deny: function (target, room, user) {
			if (user.locked || !user.autoconfirmed) return this.errorReply(`To prevent spamming you must be on an autoconfirmed account and unlocked to send friend requests.`);
			if (!target) return this.parse(`/help friends`);
			let targetId = toId(target);
			// If the user has not initalized their friends list, parse /friends init
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (!friends[targetId].pendingRequests.includes(user.userid)) return this.errorReply(`${target} has not sent you a friend request.`);
			friends[targetId].pendingRequests.splice(friends[targetId].pendingRequests.indexOf(user.userid), 1);
			write();
			if (Users(targetId) && Users(targetId).connected) Users(targetId).send(`|pm|${user.getIdentity}|${Users(targetId).getIdentity()}|/raw ${Server.nameColor(user.name, true, true)} has declined your friend request.`);
			return this.sendReply(`You have successfully denied ${target}'s friend request.`);
		},

		enablefriends: "togglefriends",
		disablefriends: "togglefriends",
		togglefriends: function (target, room, user) {
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (friends[user.userid].disabledFriends) {
				friends[user.userid].disabledFriends = false;
				write();
				return this.sendReply(`You have successfully enabled friend requests.`);
			} else {
				friends[user.userid].disabledFriends = true;
				write();
				return this.sendReply(`You have successfully disabled friend requests.`);
			}
		},

		togglenotifications: "notify",
		notifications: "notify",
		notify: function (target, room, user) {
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (!friends[user.userid].notifications) {
				friends[user.userid].notifications = true;
				write();
				return this.sendReply(`You have successfully set your friend notifications on.`);
			} else {
				friends[user.userid].notifications = false;
				write();
				return this.sendReply(`You have successfully disabled friend notifications.`);
			}
		},

		toggleprivatize: "privatize",
		unprivatize: "privatize",
		privatize: function (target, room, user) {
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (!friends[user.userid].private) {
				friends[user.userid].private = true;
				write();
				return this.sendReply(`You have successfully made your friends list private.`);
			} else {
				friends[user.userid].private = false;
				write();
				return this.sendReply(`You have successfully made your friends list publicly visible.`);
			}
		},

		unignore: "ignore",
		ignore: function (target, room, user, connection, cmd) {
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (!target) return this.parse(`/friends help`);
			let targetId = toId(target);
			if (!friends[user.userid].friendsList.includes(targetId)) return this.errorReply(`${target} is not registered as your friend.`);
			if (!friends[user.userid].notifications) return this.errorReply(`There is no reason to ignore users when your notifications are off.`);
			if (friends[user.userid].ignoreList.includes(targetId) && cmd === "ignore") return this.errorReply(`${target} is already ignored.`);
			if (!friends[user.userid].ignoreList.includes(targetId) && cmd === "unignore") return this.errorReply(`You are not ignoring ${target}.`);
			if (cmd === "ignore") {
				friends[user.userid].ignoreList.push(targetId);
				write();
				return this.sendReply(`${target} has been successfully added to your ignore list.`);
			} else {
				friends[user.userid].ignoreList.splice(friends[user.userid].ignoreList.indexOf(targetId), 1);
				write();
				return this.sendReply(`${target} has been successfully removed from your ignore list.`);
			}
		},

		ignorelist: function (target, room, user) {
			if (!friends[user.userid]) this.parse(`/friends init`);
			if (friends[user.userid].ignoreList.length < 1) return this.errorReply(`You currently are not ignoring anyone.`);
			return this.sendReplyBox(`You are currently ignoring the following: ${Chat.toListString(friends[user.userid].ignoreList)}.`);
		},

		"!list": true,
		"": "list",
		menu: "list",
		list: function (target, room, user) {
			if (!this.runBroadcast()) return;
			if (!target || target.length > 18) target = user.userid;
			let friendsId = toId(target);
			if (!friends[friendsId]) return this.errorReply(`${target} has not initialized their friends list yet.`);
			if (friends[friendsId].private && friendsId !== user.userid) return this.errorReply(`${target} has privatized their friends list.`);
			if (friends[friendsId].friendsList.length < 1) return this.sendReplyBox(`<center>${Server.nameColor(target, true, true)} currently doesn't have any friends.</center>`);
			let display = `<div style="max-height: 200px; width: 100%; overflow: scroll;"><table><tr><center><h2>${Server.nameColor(target, true, true)}'s Friends List (${friends[friendsId].friendsList.length} Friend${friends[friendsId].friendsList.length > 1 ? "s" : ""}):</h2></center></tr>`;
			friends[friendsId].friendsList.forEach(friend => {
				display += `<tr><td style="border: 2px solid #000000; width: 20%; text-align: center"><button class="button" name="parseCommand" value="/user ${friend}">${Server.nameColor(friend, true, true)}</button></td><td style="border: 2px solid #000000; width: 20%; text-align: center"> Last Seen: ${getLastSeen(friend)}</td>`;
				if (!this.broadcasting && friendsId === user.userid) {
					display += `<td style="border: 2px solid #000000; width: 20%; text-align: center"><button class="button" name="send" value="/friends unfriend ${friend}">Unfriend ${friend}</button></td>`;
				}
			});
			display += `</tr></table>`;
			if (!this.broadcasting && friendsId === user.userid) {
				display += `<center><button class="button" name="send" value="/friends notifications">${(friends[user.userid].notifications ? `Disable Friend Notifications` : `Enable Friend Notifications`)}</center>`;
			}
			display += `</div>`;
			return this.sendReplyBox(display);
		},

		help: function () {
			this.parse(`/help friends`);
		},
	},

	friendshelp: [
		`/friends init - Initializes your friends list.
		/friends add [user] - Sends a user a friend request. Must be autoconfirmed and unlocked.
		/friends remove [user] - Unfriends a user.
		/friends accept [user] - Accepts a user's friend request.
		/friends decline [user] - Declines a user's friend request.
		/friends togglefriends - Toggles the ability for people to send you friend requests.
		/friends notify - If disabled, enables friend notifications. If enabled, disables friend notifications.
		/friends privatize - If privatized, unprivatizes your friends list. Otherwise, hides your friends list from other users.
		/friends [ignore | unignore] [user] - (Un-)Hides the specified user from your PM notifications.
		/friends ignorelist - Displays the users you are ignoring (if any).
		/friends list [optional target] - Shows the user's friends list if they have initialized their list (and haven't privatized it); defaults to yourself.
		/friends help - Shows this help command.`,
	],
};
