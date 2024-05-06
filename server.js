var express = require("express");
var app = express();

var formidable = require("express-formidable");
app.use(formidable({
    multiples: true, // request.files to be arrays of files
}));

var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;
var ObjectId = mongodb.ObjectId;

var http = require("http").createServer(app);
var bcrypt = require("bcryptjs")
var fileSystem = require("fs");

var nodemailer = require("nodemailer");
var requestModule = require('request');

var functions = require("./modules/functions");
var chat = require("./modules/chat");
var addPost = require("./modules/add-post");
var editPost = require("./modules/edit-post");

var jwt = require("jsonwebtoken");
var accessTokenSecret = "myAccessTokenSecret1234567890";

const Cryptr = require("cryptr");
global.cryptr = new Cryptr("mySecretKey");

const Filter = require("bad-words");
const filter = new Filter();

const cron = require("node-cron");
const moment = require('moment-timezone')

var admin = require("./modules/admin");
admin.init(app, express);

app.use("/voice-notes", express.static(__dirname + "/voice-notes"))
app.use("/public", express.static(__dirname + "/public"))
app.use("/uploads", express.static(__dirname + "/uploads"))
app.use("/audios", express.static(__dirname + "/audios"))
app.use("/documents", express.static(__dirname + "/documents"))
app.set("view engine", "ejs")

var socketIO = require("socket.io")(http);
var socketID = "";
var users = [];

global.mainURL = "http://localhost:3000";

var nodemailerFrom = "ananyaagrawal073@gmail.com";
var nodemailerObject = {
	host: '',
    port: 465,
    secure: true,
	auth: {
		user: "",
		pass: ""
	}
};

socketIO.on("connection", function (socket) {
	// console.log("User connected", socket.id)
	socketID = socket.id
})

function getUTCToTZInFormat(eventDateTimeUTC) {
	const userTZEventDate = eventDateTimeUTC.split("T").join(" ").slice(0, -1)
	let date = moment.utc(userTZEventDate).tz(moment.tz.guess()).format()
	date = date.split("+")[0]
	return date
}

const Stripe = require('stripe')
const stripe = Stripe('')
const stripePublicKey = ""

global.message_premium = "This feature is available in premium version only."

http.listen(3000, function () {
	console.log("Server started at " + mainURL);

	mongoClient.connect("mongodb://localhost:27017", {
		useUnifiedTopology: true
	}, async function (error, client) {
		global.database = client.db("my_social_network");
		console.log("Database connected.");

		functions.database = database;
		functions.fileSystem = fileSystem;

		chat.database = database;
		chat.socketIO = socketIO;
		chat.users = users;
		chat.ObjectId = ObjectId;
		chat.fileSystem = fileSystem;
		chat.cryptr = cryptr;
		chat.filter = filter;

		addPost.database = database;
		addPost.functions = functions;
		addPost.fileSystem = fileSystem;
		addPost.requestModule = requestModule;
		addPost.filter = filter;
		addPost.ObjectId = ObjectId;
		addPost.mainURL = mainURL;

		editPost.database = database;
		editPost.functions = functions;
		editPost.fileSystem = fileSystem;
		editPost.requestModule = requestModule;
		editPost.filter = filter;
		editPost.ObjectId = ObjectId;

		admin.database = database;
		admin.bcrypt = bcrypt;
		admin.jwt = jwt;
		admin.ObjectId = ObjectId;
		admin.fileSystem = fileSystem;
		admin.mainURL = mainURL;

		app.post("/deleteAccount", async function (request, result) {
			const accessToken = request.fields.accessToken
			const password = request.fields.password

			if (!password) {
				result.json({
					status: "error",
					message: "Password is required for account deletion."
				})

				return
			}

			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})

			if (user == null) {
				result.json({
					status: "error",
					message: "User not found."
				})

				return
			}

			bcrypt.compare(password, user.password, async function (error, res) {
				if (res === true) {

					// get profile image and cover photo
					// delete them
					if (user.profileImage != "") {
						await fileSystem.unlinkSync(user.profileImage)
					}

					if (user.coverPhoto != "") {
						await fileSystem.unlinkSync(user.coverPhoto)
					}

					// delete from posts collection
					await database.collection("posts").deleteMany({
						"user._id": user._id
					})

					// delete from other user friends array
					await database.collection("users").updateMany({
						"friends._id": user._id
					}, {
						$pull: {
							"friends": {
								"_id": user._id
							}
						}
					})

					// delete from users collection
					await database.collection("users").deleteOne({
						_id: user._id
					})

					result.json({
						status: "success",
						message: "Account has been deleted."
					})

					return
				} else {
					result.json({
						status: "error",
						message: "Password is in-correct."
					})

					return
				}
			})
		})

		app.post("/createGroupForChat", async function (request, result) {

			result.json({
				status: "error",
				message: message_premium
			})

		})

		app.post("/fetchNearby", async function (request, result) {
			const accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})
			
			if (user == null) {
				result.json({
					status: "error",
					message: "User has been logged out. Please login again."
				})
				return
			}
			
			if (user.isBanned) {
				result.json({
					status: "error",
					message: "You have been banned."
				})
				return
			}

			const data = []
			if (typeof user.location !== "undefined") {
				let users = await database.collection("users").find({
					$and: [{
						_id: {
							$ne: user._id
						}
					}, {
						"location.city": user.location.city
					}]
				}).toArray()

				users = users.sort(function (a, b) {
					return 0.5 - Math.random()
				})

				for (let a = 0; a < users.length; a++) {
					data.push({
						_id: users[a]._id,
						name: users[a].name,
						profileImage: users[a].profileImage,
						city: users[a].location.city
					})
				}
			}

			result.json({
				status: "success",
				message: "Data has been fetched.",
				data: data
			})
		})

		app.get("/people-nearby", async function (request, result) {
			result.render("people-nearby")
		})

		app.post("/watchVideoPlayed", async function (request, result) {
			const accessToken = request.fields.accessToken
			const src = request.fields.src
			const postId = request.fields.postId

			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})
			
			if (user == null) {
				result.json({
					status: "error",
					message: "User has been logged out. Please login again."
				})
				return
			}
			
			if (user.isBanned) {
				result.json({
					status: "error",
					message: "You have been banned."
				})
				return
			}

			const post = await database.collection("posts").findOne({
				_id: ObjectId(postId)
			})

			if (post == null) {
				result.json({
					status: "error",
					message: "Post not found."
				})

				return
			}

			let updatedViews = 0
			const videos = post.videos || []
			for (let a = 0; a < videos.length; a++) {
				if (videos[a].src == src) {
					const viewers = videos[a].viewers || []
					updatedViews = viewers.length
					let flag = false
					for (let b = 0; b < viewers.length; b++) {
						if (viewers[b]._id.toString() == user._id.toString()) {
							flag = true
							break
						}
					}

					if (!flag) {
						await database.collection("posts").findOneAndUpdate({
							$and: [{
								_id: ObjectId(postId)
							}, {
								"videos.src": src
							}]
						}, {
							$push: {
								"videos.$.viewers": {
									_id: user._id
								}
							}
						})
						updatedViews++
					}

					break
				}
			}

			result.json({
				status: "success",
				message: "Video has been marked as watched.",
				updatedViews: updatedViews
			})
		})

		app.post("/fetchWatch", async function (request, result) {
			const accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})
			
			if (user == null) {
				result.json({
					status: "error",
					message: "User has been logged out. Please login again."
				})
				return
			}
			
			if (user.isBanned) {
				result.json({
					status: "error",
					message: "You have been banned."
				})
				return
			}

			var ids = []
			ids.push(user._id)

			for (var a = 0; a < user.pages.length; a++) {
				ids.push(user.pages[a]._id);
			}

			for (var a = 0; a < user.groups.length; a++) {
				if (user.groups[a].status == "Accepted") {
					ids.push(user.groups[a]._id);
				}
			}

			for (var a = 0; a < user.friends.length; a++) {
                if (user.friends[a].status == "Accepted") {
					ids.push(user.friends[a]._id);
                }
			}

			const advertisements = await database.collection("advertisements").find({
				$and: [{
					whereToShow: "newsfeed"
				}, {
					status: "active"
				}]
			}).toArray()

			const postIds = []
			for (let a = 0; a < advertisements.length; a++) {
				postIds.push(advertisements[a].post._id)
			}

			let posts = await database.collection("posts")
				.find({
					$and: [{
						$or: [{
							savedPaths: {
								$regex: ".mp4"
							}
						}, {
							savedPaths: {
								$regex: ".mkv"
							}
						}, {
							savedPaths: {
								$regex: ".mov"
							}
						}]
					}, {
						$and: [{
							_id: {
								$in: postIds
							}
						}, {
							isBoost: true
						}]
					}]
				})
				.toArray()

			posts = posts.sort(function (a, b) {
				return 0.5 - Math.random()
			})

			const data = []
			for (let a = 0; a < posts.length; a++) {
				const savedPaths = []
				for (let b = 0; b < posts[a].savedPaths.length; b++) {
					if (posts[a].savedPaths[b].includes(".mp4")
						|| posts[a].savedPaths[b].includes(".mkv")
						|| posts[a].savedPaths[b].includes(".mov")) {
						savedPaths.push(posts[a].savedPaths[b])
					}
				}
				posts[a].savedPaths = savedPaths
				data.push(posts[a])
			}

			result.json({
				status: "success",
				message: "Data has been fetched.",
				data: data
			})
		})


		app.get("/watch", function (request, result) {
			result.render("watch")
		})

		app.post("/fetchMyAds", async function (request, result) {
			const accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})
			
			if (user == null) {
				result.json({
					status: "error",
					message: "User has been logged out. Please login again."
				})
				return
			}
			
			if (user.isBanned) {
				result.json({
					status: "error",
					message: "You have been banned."
				})
				return
			}

			const post = await database.collection("posts")
				.findOne({
					"user._id": user._id
				})

			if (post == null) {
				result.json({
					status: "error",
					message: "Create a post first to see how your boosted posts will look."
				})
				return
			}

			let endAt = new Date()
			endAt.setDate(endAt.getDate() + 5)

			// this is a dummy data, real data is available in premium version only
			const ads = []
			ads.push({
				budget: 100,
				whereToShow: ["newsfeed"],
				user: {
					_id: user._id,
					name: user.name,
					email: user.email
				},
				post: {
					_id: post._id,
					caption: post.caption,
					savedPaths: post.savedPaths,
		            youtube_url: post.youtube_url,
		            type: post.type,
		            createdAt: post.createdAt,
				},
				status: "active", // active, inactive
				createdAt: new Date().getTime(),
				endAt: endAt
			})

			result.json({
				status: "success",
				message: "Data has been fetched.",
				ads: ads
			})
		})

		app.get("/ads", async function (request, result) {
			result.render("myAds")
		})

		app.post("/createStripeIntent", async function (request, result) {
			result.json({
				status: "error",
				message: message_premium
			})
		})

		app.post("/boostPost", async function (request, result) {
			const _id = request.fields._id
			const accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})
			
			if (user == null) {
				result.json({
					status: "error",
					message: "User has been logged out. Please login again."
				})
				return
			}
			
			if (user.isBanned) {
				result.json({
					status: "error",
					message: "You have been banned."
				})
				return
			}

			const post = await database.collection("posts").findOne({
				_id: ObjectId(_id)
			})

			if (post == null) {
				result.json({
					status: "error",
					message: "Post not found."
				})
				return
			}

			if (post.isBoost) {
				result.json({
					status: "error",
					message: "Post is already boosted."
				})
				return
			}

			let isMyUploaded = false;
			if (post.type == "group_post") {
				if (post.uploader._id.toString() == user._id.toString()) {
					isMyUploaded = true
				}
			} else if (post.user._id.toString() == user._id.toString()) {
				isMyUploaded = true
			}

			if (!isMyUploaded) {
				result.json({
					status: "error",
					message: "Unauthorized."
				})
				return
			}

			result.json({
				status: "success",
				message: "Data has been fetched.",
				post: {
					_id: post._id,
					caption: post.caption,
					savedPaths: post.savedPaths,
					youtube_url: post.youtube_url,
					type: post.type,
					createdAt: post.createdAt,
					likers: post.likers.length,
					dislikers: post.dislikers.length,
					comments: post.comments.length,
					shares: post.shares.length
				}
			})
		})

		app.get("/boostPost/:_id", function (request, result) {
			const _id = request.params._id
			result.render("boostPost", {
				_id: _id,
				stripePublicKey: stripePublicKey
			})
		})

		app.post("/deleteEvent", async function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			})

		})

		app.post("/notGoingToEvent", async function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			})
			
		})

		app.post("/goingToEvent", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/getEventDetail", async function (request, result) {
			const accessToken = request.fields.accessToken
			const _id = request.fields._id
			
			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})
			
			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})
				return false
			}
			
			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})
				return false
			}

			const event = {
				name: "Dummy event",
				description: "This is a dummy event. Real data is available in premium version.",
				location: "Pakistan",
				user: {
					_id: user._id,
					name: user.name,
					username: user.username,
					profileImage: user.profileImage
				},
				image: "uploads/steve-jobs.jpg",
				video: "uploads/video.mp4",
				eventDate: new Date(),
				comments: "Dummy event comment",
				going: [{
					_id: user._id,
					name: user.name,
					profileImage: user.profileImage
				}],
				createdAt: new Date().getTime()
			}

			// event.eventDate = getUTCToTZInFormat(event.eventDate)

			result.json({
				status: "success",
				message: "Data has been fetched.",
				event: event
			})
		})

		app.get("/event", function (request, result) {
			result.render("eventDetail")
		})

		app.post("/getEvents", async function (request, result) {
			const accessToken = request.fields.accessToken
			
			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})
			
			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})
				return false
			}
			
			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})
				return false
			}

			const data = []
			const upcomingEvents = []
			const goingEvents = []

			const obj = {
				name: "Dummy event",
				description: "This is a dummy event. Real data is available in premium version.",
				location: "Pakistan",
				user: {
					_id: user._id,
					name: user.name,
					username: user.username,
					profileImage: user.profileImage
				},
				image: "uploads/steve-jobs.jpg",
				video: "uploads/video.mp4",
				eventDate: new Date(),
				comments: "Dummy event comment",
				going: [{
					_id: user._id,
					name: user.name,
					profileImage: user.profileImage
				}],
				createdAt: new Date().getTime()
			}

			data.push(obj)
			upcomingEvents.push(obj)
			goingEvents.push(obj)

			result.json({
				status: "success",
				message: "Data has been fetched.",
				data: data,
				upcomingEvents: upcomingEvents,
				goingEvents: goingEvents
			})
		})

		app.post("/createEvent", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.get("/events", function (request, result) {
			result.render("events")
		})

		app.post("/deleteStory", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/getSingleStory", async function (request, result) {
			const accessToken = request.fields.accessToken;
			const userId = request.fields.userId;

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			});

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}

			const stories = []
			stories.push({
                user: {
                    _id: user._id,
                    name: user.name,
                    profileImage: user.profileImage
                },
                caption: "Dummy story",
                attachment: "uploads/steve-jobs.jpg",
                status: "active", // active, passed
                viewers: [{
					_id: ObjectId(),
					user: {
						_id: user._id,
						name: user.name,
						profileImage: user.profileImage
					},
					createdAt: new Date().getTime()
				}],
                seconds: 10,
                createdAt: new Date().getTime()
			})

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"stories": stories,
				"isMyStory": true
			});
		});

		app.get("/viewStory/:userId", async function (request, result) {
			const userId = request.params.userId;

			result.render("viewStory", {
				"userId": userId
			});
		});

		app.post("/getStories", async function (request, result) {
			const accessToken = request.fields.accessToken;
		
			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			});

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}

			const newArr = []
			newArr.push({
                user: {
                    _id: user._id,
                    name: user.name,
                    profileImage: user.profileImage
                },
                caption: "Dummy story",
                attachment: "uploads/stories/steve-jobs.jpg",
                status: "active", // active, passed
                viewers: [{
					_id: ObjectId(),
					user: {
						_id: user._id,
						name: user.name,
						profileImage: user.profileImage
					},
					createdAt: new Date().getTime()
				}],
                seconds: 10,
                createdAt: new Date().getTime()
            })

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": newArr
			});
		});

		app.route("/addStory")
			.get(function (request, result) {
				result.render("addStory");
			})
			.post(async function (request, result) {
				result.json({
					"status": "error",
					"message": message_premium
				})
			});

		app.get("/signup", function (request, result) {
			result.render("signup");
		});

		app.get("/forgot-password", function (request, result) {
			result.render("forgot-password");
		});

		app.post("/sendRecoveryLink", function (request, result) {
			result.json({
				'status': "error",
				'message': message_premium
			});
		});

		app.get("/change-password", function (request, result) {
			result.render("change-password");
		});

		app.post("/changePassword", function (request, result) {
			
			var accessToken = request.fields.accessToken;
			var current_password = request.fields.current_password;
			var new_password = request.fields.new_password;
			var confirm_password = request.fields.confirm_password;

			if (new_password != confirm_password) {
		    	result.json({
					'status': "error",
					'message': 'Password does not match.'
				});
		        return;
		    }

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					bcrypt.compare(password, user.password, async function(err, res) {
						if (res === true) {
							bcrypt.genSalt(10, function(err, salt) {
								bcrypt.hash(new_password, salt, async function(err, hash) {
									database.collection("users").findOneAndUpdate({
										"accessToken": accessToken
									}, {
										$set: {
											"password": hash
										}
									}, function (error, data) {
										result.json({
											"status": "success",
											"message": "Password has been changed"
										})
									})
								})
							})
						} else {
							result.json({
								"status": "error",
								"message": "Current password is not correct"
							})
						}
					})
				}
			})
		})

		app.post("/signup", function (request, result) {
			var name = request.fields.name;
			var username = request.fields.username;
			var email = request.fields.email;
			var password = request.fields.password;
			var gender = request.fields.gender;
			var reset_token = "";
			var isVerified = true;
			var isBanned = false;
			var verification_token = new Date().getTime();
			// verification_token = ""

			database.collection("users").findOne({
				$or: [{
					"email": email
				}, {
					"username": username
				}]
			}, function (error, user) {
				if (user == null) {
					bcrypt.genSalt(10, function(err, salt) {
					    bcrypt.hash(password, salt, async function(err, hash) {
					    	database.collection("users").insertOne({
								"name": name,
								"username": username,
								"email": email,
								"password": hash,
								"gender": gender,
								"reset_token": reset_token,
								"profileImage": "",
								"coverPhoto": "",
								"dob": "",
								"city": "",
								"country": "",
								"aboutMe": "",
								"friends": [],
								"pages": [],
								"notifications": [],
								"groups": [],
								"isVerified": isVerified,
								"verification_token": verification_token,
								"isBanned": isBanned
							}, function (error, data) {

								/*var transporter = nodemailer.createTransport(nodemailerObject);

								var text = "Please verify your account by click the following link: " + mainURL + "/verifyEmail/" + email + "/" + verification_token;
								var html = "Please verify your account by click the following link: <br><br> <a href='" + mainURL + "/verifyEmail/" + email + "/" + verification_token + "'>Confirm Email</a> <br><br> Thank you.";

								transporter.sendMail({
									from: nodemailerFrom,
									to: email,
									subject: "Email Verification",
									text: text,
									html: html
								}, function (error, info) {
									if (error) {
										console.error(error);
									} else {
										console.log("Email sent: " + info.response);
									}*/
									
									result.json({
										"status": "success",
										"message": "Signed up successfully. Kindly login now."
									});

								// });
								
							})
					    })
					})
				} else {
					result.json({
						"status": "error",
						"message": "Email or username already exist."
					});
				}
			});
		});

		app.get("/login", function (request, result) {
			result.render("login");
		})

		app.post("/getKeys", async function (request, result) {
			const accessToken = request.fields.accessToken
			const _id = request.fields.user
			
			const me = await database.collection("users").findOne({
				accessToken: accessToken
			})

			if (me == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (me.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return
			}

			const user = await database.collection("users").findOne({
				_id: ObjectId(_id)
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User does not exists."
				})

				return
			}

			result.json({
				status: "success",
				message: "Data has been fetched.",
				privateKey: me.privateKey,
				publicKey: user.publicKey
			})
		})

		app.post("/updateKeys", async function (request, result) {
			const email = request.fields.email
			const publicKey = request.fields.publicKey
			const privateKey = request.fields.privateKey

			if (!email || !publicKey || !privateKey) {
				result.json({
					"status": "error",
					"message": "Please fill all fields."
				})
				return
			}

			const user = await database.collection("users").findOne({
				email: email
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return
			}

			await database.collection("users").findOneAndUpdate({
				_id: user._id
			}, {
				$set: {
					publicKey: publicKey,
					privateKey: privateKey
				}
			})

			result.json({
				"status": "success",
				"message": "Keys has been updated.",
				"profileImage": user.profileImage
			})
		})

		app.post("/login", function (request, result) {
			var email = request.fields.email;
			var password = request.fields.password;
			database.collection("users").findOne({
				"email": email
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "Email does not exist"
					});
					
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					bcrypt.compare(password, user.password, function (error, res) {
						if (res === true) {

							if (user.isVerified) {
								var accessToken = jwt.sign({ email: email }, accessTokenSecret);
								database.collection("users").findOneAndUpdate({
									"email": email
								}, {
									$set: {
										"accessToken": accessToken
									}
								}, function (error, data) {
									result.json({
										"status": "success",
										"message": "Login successfully",
										"accessToken": accessToken,
										"profileImage": user.profileImage,
										"hasKey": user.publicKey
									});
									return
								});
							}  else {
								result.json({
									"status": "error",
									"message": "Kindly verify your email."
								});
								return
							}
							
						} else {
							result.json({
								"status": "error",
								"message": "Password is not correct"
							});
							return
						}
					});
				}
			});
		});

		app.post("/fetchUser", async function (request, result) {
			const accessToken = request.fields.accessToken
			const username = request.fields.username

			const me = await database.collection("users").findOne({
				accessToken: accessToken
			})

			const filter = []
			filter.push({
				username: username
			})

			if (ObjectId.isValid(username)) {
				filter.push({
					_id: ObjectId(username)
				})
			}

			const user = await database.collection("users").findOne({
				$or: filter
			})

			if (user == null) {
				result.json({
					status: "error",
					message: "User not found."
				})

				return
			}

			const userObj = {
				name: user.name,
			}

			userObj.email = user.email
			userObj.dob = user.dob
			userObj.city = user.city
			userObj.country = user.country
			userObj.aboutMe = user.aboutMe
			userObj.coverPhoto = user.coverPhoto
			userObj.profileImage = user.profileImage
			userObj.friends = user.friends.length

			result.json({
				status: "success",
				message: "Data has been fetched.",
				user: userObj
			})
		})

		app.get("/user/:username", async function (request, result) {
			result.render("userProfile", {
				"username": request.params.username
			})
		})

		app.get("/updateProfile", function (request, result) {
			result.render("updateProfile")
		})

		app.post("/getUser", async function (request, result) {
			const accessToken = request.fields.accessToken
			
			const user = await database.collection("users").findOne({
				accessToken: accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return
			}

			user.profileViewers = await database.collection("profile_viewers").find({
				"profile._id": user._id
			}).toArray()

			user.pages = await database.collection("pages").find({
				"user._id": user._id
			}).toArray()

			let hasLocationExpired = true
			if (typeof user.location !== "undefined") {
				const currentTimestamp = new Date().setDate(new Date().getDate() + 1)
				if (currentTimestamp > user.location.createdAt) {
					hasLocationExpired = false
				}
			}

			if (hasLocationExpired) {
				requestModule.post("http://www.geoplugin.net/json.gp", {
	                formData: null
	            }, async function(err, res, data) {
	                if (!err && res.statusCode === 200) {
	                    // console.log(data)

	                    data = JSON.parse(data)

	                    const city = data.geoplugin_city
						const continent = data.geoplugin_continentName
						const country = data.geoplugin_countryName
						const currencyConverter = data.geoplugin_currencyConverter
						const latitude = parseFloat(data.geoplugin_latitude)
						const longitude = parseFloat(data.geoplugin_longitude)
						const region = data.geoplugin_region
						const ipAddress = data.geoplugin_request
						const timezone = data.geoplugin_timezone

						const locationObj = {
							city: city,
							continent: continent,
							country: country,
							currencyConverter: currencyConverter,
							latitude: latitude,
							longitude: longitude,
							region: region,
							ipAddress: ipAddress,
							timezone: timezone,
							createdAt: new Date().getTime()
						}

						await database.collection("users").findOneAndUpdate({
							_id: user._id
						}, {
							$set: {
								location: locationObj
							}
						})
	                }
	            })
			}

			if (typeof user.profileLocked === "undefined") {
				user.profileLocked = "no"
			}

			result.json({
				"status": "success",
				"message": "Record has been fetched.",
				"data": {
					_id: user._id,
					name: user.name,
					username: user.username,
					email: user.email,
					password: user.password,
					gender: user.gender,
					profileImage: user.profileImage,
					coverPhoto: user.coverPhoto,
					dob: user.dob,
					city: user.city,
					country: user.country,
					aboutMe: user.aboutMe,
					friends: user.friends,
					pages: user.pages,
					notifications: user.notifications,
					groups: user.groups,
					accessToken: user.accessToken,
					profileViewers: user.profileViewers,
					profileLocked: user.profileLocked
				}
			})
		})

		app.get("/logout", function (request, result) {
			result.redirect("/login");
		});

		app.post("/uploadCoverPhoto", function (request, result) {
			var accessToken = request.fields.accessToken;
			var coverPhoto = "";

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					if (request.files.coverPhoto.size > 0 && request.files.coverPhoto.type.includes("image")) {

						if (user.coverPhoto != "") {
							fileSystem.unlink(user.coverPhoto, function (error) {
								//
							});
						}

						coverPhoto = "public/images/cover-" + new Date().getTime() + "-" + request.files.coverPhoto.name;

						// Read the file
	                    fileSystem.readFile(request.files.coverPhoto.path, function (err, data) {
	                        if (err) throw err;
	                        console.log('File read!');

	                        // Write the file
	                        fileSystem.writeFile(coverPhoto, data, function (err) {
	                            if (err) throw err;
	                            console.log('File written!');

	                            database.collection("users").updateOne({
									"accessToken": accessToken
								}, {
									$set: {
										"coverPhoto": coverPhoto
									}
								}, function (error, data) {
									result.json({
										"status": "status",
										"message": "Cover photo has been updated.",
										data: mainURL + "/" + coverPhoto
									});
								});
	                        });

	                        // Delete the file
	                        fileSystem.unlink(request.files.coverPhoto.path, function (err) {
	                            if (err) throw err;
	                            console.log('File deleted!');
	                        });
	                    });
					} else {
						result.json({
							"status": "error",
							"message": "Please select valid image."
						});
					}
				}
			});
		});

		app.post("/uploadProfileImage", function (request, result) {
			var accessToken = request.fields.accessToken;
			var profileImage = "";

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {
					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					if (request.files.profileImage.size > 0 && request.files.profileImage.type.includes("image")) {

						if (user.profileImage != "") {
							fileSystem.unlink(user.profileImage, function (error) {
								// console.log("error deleting file: " + error);
							});
						}

						profileImage = "public/images/profile-" + new Date().getTime() + "-" + request.files.profileImage.name;

						// Read the file
	                    fileSystem.readFile(request.files.profileImage.path, function (err, data) {
	                        if (err) throw err;
	                        console.log('File read!');

	                        // Write the file
	                        fileSystem.writeFile(profileImage, data, function (err) {
	                            if (err) throw err;
	                            console.log('File written!');

	                            database.collection("users").updateOne({
									"accessToken": accessToken
								}, {
									$set: {
										"profileImage": profileImage
									}
								}, async function (error, data) {

									await functions.updateUser(user, profileImage, user.name);
									result.json({
										"status": "status",
										"message": "Profile image has been updated.",
										data: mainURL + "/" + profileImage
									});
								});
	                        });

	                        // Delete the file
	                        fileSystem.unlink(request.files.profileImage.path, function (err) {
	                            if (err) throw err;
	                            console.log('File deleted!');
	                        });
	                    });
					} else {
						result.json({
							"status": "error",
							"message": "Please select valid image."
						});
					}
				}
			});
		});

		app.post("/updateProfile", function (request, result) {
			var accessToken = request.fields.accessToken;
			var name = request.fields.name;
			var dob = request.fields.dob;
			var city = request.fields.city;
			var country = request.fields.country;
			var aboutMe = request.fields.aboutMe;

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					database.collection("users").updateOne({
						"accessToken": accessToken
					}, {
						$set: {
							"name": name,
							"dob": dob,
							"city": city,
							"country": country,
							"aboutMe": aboutMe
						}
					}, async function (error, data) {

						await functions.updateUser(user, user.profileImage, name);
						result.json({
							"status": "status",
							"message": "Profile has been updated."
						});
					});
				}
			});
		});

		app.get("/post/:id", function (request, result) {
			database.collection("posts").findOne({
				"_id": ObjectId(request.params.id)
			}, function (error, post) {
				if (post == null) {
					result.render("errors/404", {
						"message": "This post does not exist anymore."
					});
				} else {
					result.render("postDetail", {
						"post": post
					});
				}
			});
		});

		app.get("/", function (request, result) {
			result.render("index")
		})

		app.post("/addPost", function (request, result) {
			addPost.execute(request, result);
		});

        app.post("/getUserFeed", async function (request, result) {
            var username = request.fields.username;
            var accessToken = request.fields.accessToken;

            var profile = await database.collection("users").findOne({
                "username": username
            });
            if (profile == null) {
                result.json({
                    "status": "error",
                    "message": "User does not exist."
                });
                return;
            }

            var me = await database.collection("users").findOne({
                "accessToken": accessToken
            });
            if (me == null) {
                result.json({
                    "status": "error",
                    "message": "Sorry, you have been logged out."
                });
                return;
            }

            // profile.profileLocked = await functions.isProfileLocked(me, profile)

            // if (profile.profileLocked == "yes") {
            // 	result.json({
	        //         "status": "success",
	        //         "message": "Record has been fetched",
	        //         "data": []
	        //     })

	        //     return
            // }

            // /* add or update the profile views counter */
            if (me.username != username) {
                var hasViewed = await database.collection("profile_viewers").findOne({
                    $and: [{
                        "profile._id": profile._id
                    }, {
                        "user._id": me._id
                    }]
                });
                if (hasViewed == null) {
                    /* insert the view. */
                    /* username is saved so the other person can visit his profile. */
                    await database.collection("profile_viewers").insertOne({
                        "profile": {
                            "_id": profile._id,
                            "name": profile.name,
                            "username": profile.username,
                            "profileImage": profile.profileImage
                        },
                        "user": {
                            "_id": me._id,
                            "name": me.name,
                            "username": me.username,
                            "profileImage": me.profileImage
                        },
                        "views": 1,
                        "viewed_at": new Date().getTime()
                    });
                } else {
                    /* increment the counter and time */
                    await database.collection("profile_viewers").updateOne({
                        "_id": hasViewed._id
                    }, {
                        $inc: {
                            "views": 1
                        },
                        $set: {
                            "viewed_at": new Date().getTime()
                        }
                    });
                }
            }

            database.collection("posts")
	            .find({
	                "user._id": profile._id
	            })
	            .sort({
	                "createdAt": -1
	            })
	            .limit(5)
	            .toArray(function (error, data) {
	                result.json({
	                    "status": "success",
	                    "message": "Record has been fetched",
	                    "data": data
	                });
	            });
        });

        app.get("/profileViews", function (request, result) {
        	result.render("profileViews");
        });

		app.post("/getNewsfeed", async function (request, result) {
			var accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})
				return false
			}

			var ids = []
			ids.push(user._id)

			for (var a = 0; a < user.pages.length; a++) {
				ids.push(user.pages[a]._id);
			}

			for (var a = 0; a < user.groups.length; a++) {
				if (user.groups[a].status == "Accepted") {
					ids.push(user.groups[a]._id);
				}
			}

			for (var a = 0; a < user.friends.length; a++) {
                if (user.friends[a].status == "Accepted") {
					ids.push(user.friends[a]._id);
                }
			}

			let data = await database.collection("posts")
				.find({
					"user._id": {
						$in: ids
					}
				})
				.sort({
					"createdAt": -1
				})
				.limit(5)
				.toArray()

			result.json({
				"status": "success",
				"message": "Record has been fetched",
				"data": data
			})
		})

		app.post("/toggleDislikeStory", async function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/toggleDislikePost", async function (request, result) {

			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}

			const post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return
			}

			var isDisliked = false;
			const dislikers = post.dislikers || []
			for (var a = 0; a < dislikers.length; a++) {
				var disliker = dislikers[a];

				if (disliker._id.toString() == user._id.toString()) {
					isDisliked = true;
					break
				}
			}

			if (isDisliked) {
				await database.collection("posts").updateOne({
					"_id": ObjectId(_id)
				}, {
					$pull: {
						"dislikers": {
							"_id": user._id,
						}
					}
				})

				result.json({
					"status": "undisliked",
					"message": "Post has been un-disliked."
				})

				return
			}

			await database.collection("posts").updateOne({
				"_id": ObjectId(_id)
			}, {
				$push: {
					"dislikers": {
						"_id": user._id,
						"name": user.name,
						"username": user.username,
						"profileImage": user.profileImage,
						"createdAt": new Date().getTime()
					}
				}
			})

			if (user._id.toString() != post.user._id.toString()) {
				if (post.type == "page_post") {
					const page = await database.collection("pages").findOne({
		                _id: post.user._id
		            })

		            if (page != null) {
		            	await database.collection("users").updateOne({
							_id: page.user._id
						}, {
							$push: {
								notifications: {
									_id: ObjectId(),
									type: "post_disliked",
									content: user.name + " has dis-liked your post.",
									profileImage: user.profileImage,
									isRead: false,
									post: {
										_id: post._id
									},
									createdAt: new Date().getTime()
								}
							}
						})
		            }
				} else if (post.type == "group_post") {
					await database.collection("users").updateOne({
						"_id": post.uploader._id
					}, {
						$push: {
							"notifications": {
								"_id": ObjectId(),
								"type": "post_disliked",
								"content": user.name + " has dis-liked your post.",
								"profileImage": user.profileImage,
								"isRead": false,
								"post": {
									"_id": post._id
								},
								"createdAt": new Date().getTime()
							}
						}
					})
				} else if (post.type == "post") {
					await database.collection("users").updateOne({
						"_id": post.user._id
					}, {
						$push: {
							"notifications": {
								"_id": ObjectId(),
								"type": "post_disliked",
								"content": user.name + " has dis-liked your post.",
								"profileImage": user.profileImage,
								"isRead": false,
								"post": {
									"_id": post._id
								},
								"createdAt": new Date().getTime()
							}
						}
					})
				}
			}

			result.json({
				"status": "success",
				"message": "Post has been disliked."
			})
		})

		app.post("/toggleLikeStory", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/toggleLikePost", async function (request, result) {

			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}

			const post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return
			}

			var isLiked = false;
			const likers = post.likers || []
			for (var a = 0; a < likers.length; a++) {
				var liker = likers[a];

				if (liker._id.toString() == user._id.toString()) {
					isLiked = true;
					break;
				}
			}

			if (isLiked) {
				await database.collection("posts").updateOne({
					"_id": ObjectId(_id)
				}, {
					$pull: {
						"likers": {
							"_id": user._id,
						}
					}
				})

				result.json({
					"status": "unliked",
					"message": "Post has been unliked."
				})

				return
			}

			if (user._id.toString() != post.user._id.toString()) {
				if (post.type == "page_post") {
					const page = await database.collection("pages").findOne({
		                _id: post.user._id
		            })

		            if (page != null) {
		            	await database.collection("users").updateOne({
							_id: page.user._id
						}, {
							$push: {
								notifications: {
									_id: ObjectId(),
									type: "post_liked",
									content: user.name + " has liked your post.",
									profileImage: user.profileImage,
									isRead: false,
									post: {
										_id: post._id
									},
									createdAt: new Date().getTime()
								}
							}
						})
		            }
				} else if (post.type == "group_post") {
					await database.collection("users").updateOne({
						"_id": post.uploader._id
					}, {
						$push: {
							"notifications": {
								"_id": ObjectId(),
								"type": "post_liked",
								"content": user.name + " has liked your post.",
								"profileImage": user.profileImage,
								"isRead": false,
								"post": {
									"_id": post._id
								},
								"createdAt": new Date().getTime()
							}
						}
					})
				} else if (post.type == "post") {
					await database.collection("users").updateOne({
						"_id": post.user._id
					}, {
						$push: {
							"notifications": {
								"_id": ObjectId(),
								"type": "post_liked",
								"content": user.name + " has liked your post.",
								"profileImage": user.profileImage,
								"isRead": false,
								"post": {
									"_id": post._id
								},
								"createdAt": new Date().getTime()
							}
						}
					})
				}
			}

			await database.collection("posts").updateOne({
				"_id": ObjectId(_id)
			}, {
				$push: {
					"likers": {
						"_id": user._id,
						"name": user.name,
						"username": user.username,
						"profileImage": user.profileImage,
						"createdAt": new Date().getTime()
					}
				}
			})

			result.json({
				"status": "success",
				"message": "Post has been liked."
			})
		})

		app.post("/fetchCommentsByPost", async function (request, result) {
			const accessToken = request.fields.accessToken
			const _id = request.fields._id

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return
			}

			const post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return
			}

			let comments = post.comments
			comments = comments.reverse()

			result.json({
				status: "success",
				message: "Data has been fetched.",
				comments: comments
			})
		})

		app.post("/postCommentOnStory", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/postComment", async function (request, result) {
			var accessToken = request.fields.accessToken
			var _id = request.fields._id
			var comment = request.fields.comment
			var createdAt = new Date().getTime()

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return
			}

			const post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return
			}

			var commentId = ObjectId()
			const commentObj = {
				"_id": commentId,
				"user": {
					"_id": user._id,
					"name": user.name,
					"profileImage": user.profileImage,
				},
				"comment": comment,
				"createdAt": createdAt,
				"replies": []
			}

			await database.collection("posts").updateOne({
				"_id": ObjectId(_id)
			}, {
				$push: {
					"comments": commentObj
				}
			})

			if (user._id.toString() != post.user._id.toString()) {
				if (post.type == "post") {
					await database.collection("users").updateOne({
						"_id": post.user._id
					}, {
						$push: {
							"notifications": {
								"_id": ObjectId(),
								"type": "new_comment",
								"content": user.name + " commented on your post.",
								"profileImage": user.profileImage,
								"post": {
									"_id": post._id
								},
								"isRead": false,
								"createdAt": new Date().getTime()
							}
						}
					})
				}
			}

			const updatePost = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (updatePost == null) {
				result.json({
					"status": "success",
					"message": "Post does not exists."
				})

				return
			}

			socketIO.emit("commentPosted", {
				post: updatePost,
				comment: commentObj
			})

			result.json({
				"status": "success",
				"message": "Comment has been posted.",
				"updatePost": updatePost
			})
		})

		app.post("/postReply", function (request, result) {

			var accessToken = request.fields.accessToken;
			var postId = request.fields.postId;
			var commentId = request.fields.commentId;
			var reply = request.fields.reply;
			var createdAt = new Date().getTime();

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {
					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					database.collection("posts").findOne({
						"_id": ObjectId(postId)
					}, function (error, post) {
						if (post == null) {
							result.json({
								"status": "error",
								"message": "Post does not exist."
							});
						} else {

							var replyId = ObjectId()
							const replyObj = {
								"_id": replyId,
								"user": {
									"_id": user._id,
									"name": user.name,
									"profileImage": user.profileImage,
								},
								"reply": reply,
								"createdAt": createdAt
							}

							database.collection("posts").updateOne({
								$and: [{
									"_id": ObjectId(postId)
								}, {
									"comments._id": ObjectId(commentId)
								}]
							}, {
								$push: {
									"comments.$.replies": replyObj
								}
							}, function (error, data) {

								database.collection("users").updateOne({
									$and: [{
										"_id": post.user._id
									}, {
										"posts._id": post._id
									}, {
										"posts.comments._id": ObjectId(commentId)
									}]
								}, {
									$push: {
										"posts.$[].comments.$[].replies": replyObj
									}
								});

								database.collection("posts").findOne({
									"_id": ObjectId(postId)
								}, function (error, updatePost) {

									socketIO.emit("postReply", {
										post: updatePost,
										reply: replyObj,
										commentId: commentId
									})

									result.json({
										"status": "success",
										"message": "Reply has been posted.",
										"updatePost": updatePost,
										replyObj: replyObj
									});
								});
							});

						}
					});
				}
			});
		});

		app.get("/search/:query", function (request, result) {
			var query = request.params.query
			result.render("search", {
				"query": query
			})
		})

		app.post("/search", async function (request, result) {
			const query = request.fields.query

			const users = await database.collection("users").find({
				$or: [{
					"name": {
						$regex: ".*" + query + ".*",
						$options: "i"
					}
				}, {
					"username": {
						$regex: ".*" + query + ".*",
						$options: "i"
					}
				}, {
					"email": {
						$regex: ".*" + query + ".*",
						$options: "i"
					}
				}]
			}).toArray()

			const pages = []
			const groups = []
			const events = []

			result.json({
				status: "success",
				message: "Record has been fetched",
				users: users,
				pages: pages,
				groups: groups,
				events: events
			})
		})

		app.post("/sendFriendRequest", function (request, result) {

			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					var me = user;
					database.collection("users").findOne({
						"_id": ObjectId(_id)
					}, function (error, user) {
						if (user == null) {
							result.json({
								"status": "error",
								"message": "User does not exist."
							});
						} else {

                            if (_id.toString() == me._id.toString()) {
                                result.json({
                                    "status": "error",
                                    "message": "You cannot send a friend request to yourself."
                                });
                                return;
                            }

                            database.collection("users").findOne({
                                $and: [{
                                    "_id": ObjectId(_id)
                                }, {
                                    "friends._id": me._id
                                }]
                            }, function (error, isExists) {
                                if (isExists) {
                                    result.json({
                                        "status": "error",
                                        "message": "Friend request already sent."
                                    });
                                } else {
                                    database.collection("users").updateOne({
                                        "_id": ObjectId(_id)
                                    }, {
                                        $push: {
                                            "friends": {
                                                "_id": me._id,
                                                "name": me.name,
                                                "username": me.username,
                                                "profileImage": me.profileImage,
                                                "status": "Pending",
                                                "sentByMe": false,
                                                "inbox": []
                                            }
                                        }
                                    }, function (error, data) {

                                        database.collection("users").updateOne({
                                            "_id": me._id
                                        }, {
                                            $push: {
                                                "friends": {
                                                    "_id": user._id,
                                                    "name": user.name,
                                                    "username": user.username,
                                                    "profileImage": user.profileImage,
                                                    "status": "Pending",
                                                    "sentByMe": true,
                                                    "inbox": []
                                                }
                                            }
                                        }, function (error, data) {

                                            result.json({
                                                "status": "success",
                                                "message": "Friend request has been sent."
                                            });

                                        });

                                    });
                                }
                            });
						}
					});
				}
			});
		});

		app.get("/friends", function (request, result) {
			result.render("friends");
		});

		app.post("/acceptFriendRequest", function (request, result) {

			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					var me = user;
					database.collection("users").findOne({
						"_id": ObjectId(_id)
					}, function (error, user) {
						if (user == null) {
							result.json({
								"status": "error",
								"message": "User does not exist."
							});
						} else {

                            for (var a = 0; a < me.friends.length; a++) {
                                if (me.friends[a]._id.toString() == _id.toString()
                                    && me.friends[a].status == "Accepted") {
                                    result.json({
                                        "status": "error",
                                        "message": "Friend request already accepted."
                                    });
                                    return;
                                }
                            }

							database.collection("users").updateOne({
								"_id": ObjectId(_id)
							}, {
								$push: {
									"notifications": {
										"_id": ObjectId(),
										"type": "friend_request_accepted",
										"content": me.name + " accepted your friend request.",
										"profileImage": me.profileImage,
										"isRead": false,
										"createdAt": new Date().getTime()
									}
								}
							});

							database.collection("users").updateOne({
								$and: [{
									"_id": ObjectId(_id)
								}, {
									"friends._id": me._id
								}]
							}, {
								$set: {
									"friends.$.status": "Accepted"
								}
							}, function (error, data) {

								database.collection("users").updateOne({
									$and: [{
										"_id": me._id
									}, {
										"friends._id": user._id
									}]
								}, {
									$set: {
										"friends.$.status": "Accepted"
									}
								}, function (error, data) {

									result.json({
										"status": "success",
										"message": "Friend request has been accepted."
									});

								});
							});

						}
					});
				}
			});
		});

		app.post("/unfriend", function (request, result) {

			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					var me = user;
					database.collection("users").findOne({
						"_id": ObjectId(_id)
					}, function (error, user) {
						if (user == null) {
							result.json({
								"status": "error",
								"message": "User does not exist."
							});
						} else {

							database.collection("users").updateOne({
								"_id": ObjectId(_id)
							}, {
								$pull: {
									"friends": {
										"_id": me._id
									}
								}
							}, function (error, data) {

								database.collection("users").updateOne({
									"_id": me._id
								}, {
									$pull: {
										"friends": {
											"_id": user._id
										}
									}
								}, function (error, data) {

									result.json({
										"status": "success",
										"message": "Friend has been removed."
									});

								});

							});

						}
					});
				}
			});
		});

		app.get("/inbox", function (request, result) {
			result.render("inbox")
		})

		app.post("/sendMessage", async function (request, result) {
			// chat.sendMessage(request, result)

			const accessToken = request.fields.accessToken
			const _id = request.fields._id
			const message = request.fields.message
			const messageEncrypted = request.fields.messageEncrypted || ""
			const iv = request.fields.iv || ""

			const me = await database.collection("users").findOne({
	            accessToken: request.fields.accessToken
	        })

	        if (me == null) {
	            result.json({
	                status: "error",
	                message: "User has been logged out. Please login again."
	            })

	            return
	        }

	        const user = await database.collection("users").findOne({
	            _id: ObjectId(_id)
	        })

	        if (user == null) {
	            result.json({
	                status: "error",
	                message: "User does not exist."
	            })

	            return
	        }

	        if (filter.isProfane(message)) {
	            result.json({
	                status: "error",
	                message: "Your message contains abusive or offensive language."
	            })

	            return
	        }

	        var messageObj = {
	            _id: ObjectId(),
	            // message: cryptr.encrypt(message),
	            message: messageEncrypted,
	            iv: iv,
	            from: me._id,
	            is_read: false,
	            images: [],
	            videos: [],
	            is_deleted: false,
	            createdAt: new Date().getTime()
	        }

	        const files = []
	        if (Array.isArray(request.files.files)) {
	            for (let a = 0; a < request.files.files.length; a++) {
	                files.push(request.files.files[a])
	            }
	        } else {
	            files.push(request.files.files)
	        }

	        functions.callbackFileUpload(files, 0, [], async function (savedPaths) {
	        	messageObj.savedPaths = savedPaths
	        	
	        	// Other user's data
		        await database.collection("users").updateOne({
		            $and: [{
		                "_id": user._id
		            }, {
		                "friends._id": me._id
		            }]
		        }, {
		            $push: {
		                "friends.$.inbox": messageObj
		            },
		            $inc: {
		                "friends.$.unread": 1
		            }
		        });

		        messageObj.is_read = true;

		        // logged in user's data
		        await database.collection("users").updateOne({
		            $and: [{
		                "_id": me._id
		            }, {
		                "friends._id": user._id
		            }]
		        }, {
		            $push: {
		                "friends.$.inbox": messageObj
		            }
		        });

		        // messageObj.message = cryptr.decrypt(messageObj.message);
		        socketIO.to(users[user._id]).emit("messageReceived", messageObj)

		        result.json({
		            status: "success",
		            message: "Message has been sent.",
		            data: messageObj
		        })
	        })
		})

		app.post("/deleteMessage", function (request, result) {
			chat.deleteMessage(request, result);
		});

		app.post("/getFriendsChat", function (request, result) {
			chat.getFriendsChat(request, result);
		});

		app.post("/connectSocket", function (request, result) {
			var accessToken = request.fields.accessToken;
			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					users[user._id] = socketID;
					result.json({
						"status": "status",
						"message": "Socket has been connected."
					});
				}
			});
		});

		app.get("/createPage", function (request, result) {
			result.render("createPage");
		});

		app.post("/createPage", function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			});

		});

		app.get("/pages", function (request, result) {
			result.render("pages");
		});

		app.post("/getPages", async function (request, result) {
			var accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})
				return false
			}

			const data = []
			data.push({
				"name": "Dummy page",
                "domainName": "adnan-tech.com",
                "additionalInfo": "This is a dummy page. Real data is available in premium version.",
                "coverPhoto": "uploads/steve-jobs.jpg",
                "likers": [],
                "user": {
                    "_id": user._id,
                    "name": user.name,
                    "profileImage": user.profileImage
                }
			})

			result.json({
				"status": "success",
				"message": "Record has been fetched.",
				"data": data,
				ads: []
			})
		});

		app.get("/page", function (request, result) {
			result.render("singlePage")
		})

		app.get("/edit-page", function (request, result) {
			const page = {
				"name": "Dummy page",
                "domainName": "ananyaagrawal073@gmail.com",
                "additionalInfo": "This is a dummy page. ",
                "coverPhoto": "uploads/steve-jobs.jpg"
			}

			result.render("editPage", {
				"page": page
			})
		});

		app.post("/editPage", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/deletePage", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/getPageDetail", async function (request, result) {
			var _id = request.fields._id
			var accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			const page = {
				"name": "Dummy page",
                "domainName": "ananyaagrawal073@gmail.com",
                "additionalInfo": "This is a dummy page..",
                "coverPhoto": "uploads/steve-jobs.jpg",
                "likers": [],
                "user": {
                    "_id": user?._id,
                    "name": user?.name,
                    "profileImage": user?.profileImage
                }
			}
			const posts = []

			const post = await database.collection("posts")
				.findOne({
					"user._id": user?._id
				})

			if (post != null) {
				posts.push(post)
			}

			result.json({
				status: "success",
				message: "Record has been fetched.",
				data: page,
				posts: posts
			})
		})

		app.post("/toggleLikePage", function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			});

		});

		app.post("/getMyPages", function (request, result) {
			var accessToken = request.fields.accessToken;

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					const data = []
					data.push({
						"name": "Dummy page",
		                "domainName": "adnan-tech.com",
		                "additionalInfo": "This is a dummy page. Real data is available in premium version.",
		                "coverPhoto": "uploads/steve-jobs.jpg",
		                "likers": [],
		                "user": {
		                    "_id": user._id,
		                    "name": user.name,
		                    "profileImage": user.profileImage
		                }
					})

					result.json({
						"status": "success",
						"message": "Record has been fetched.",
						"data": data
					});

				}
			});
		});

		app.get("/createGroup", function (request, result) {
			result.render("createGroup");
		});

		app.post("/createGroup", function (request, result) {
			result.json({
				status: "error",
				message: message_premium
			})
		})

		app.get("/groups", function (request, result) {
			result.render("groups");
		});

		app.post("/getGroups", async function (request, result) {
			var accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})
			
			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return
			}

			const data = []
			data.push({
				"name": "Dummy group",
                "additionalInfo": "This is a dummy group. Real data is available in premium version.",
                "coverPhoto": "uploads/steve-jobs.jpg",
                "members": [{
                    "_id": user._id,
                    "name": user.name,
                    "profileImage": user.profileImage,
                    "status": "Accepted"
                }],
                "user": {
                    "_id": user._id,
                    "name": user.name,
                    "profileImage": user.profileImage
                }
			})

			result.json({
				"status": "success",
				"message": "Record has been fetched.",
				"data": data,
				ads: []
			})
		})

		app.get("/group", function (request, result) {
			result.render("singleGroup")
		})

		app.get("/edit-group", function (request, result) {
			const group = {
				"name": "Dummy group",
                "additionalInfo": "This is a dummy group.",
                "coverPhoto": "uploads/steve-jobs.jpg"
			}

			result.render("editGroup", {
				"group": group
			});
		});

		app.post("/editGroup", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		});

		app.post("/deleteGroup", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		});

		app.post("/getGroupDetail", async function (request, result) {
			var _id = request.fields._id
			var accessToken = request.fields.accessToken

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			const group = {
				"name": "Dummy group",
                "additionalInfo": "This is a dummy group.",
                "coverPhoto": "uploads/steve-jobs.jpg",
                "members": [{
                    "_id": user?._id,
                    "name": user?.name,
                    "profileImage": user?.profileImage,
                    "status": "Accepted"
                }],
                "user": {
                    "_id": user?._id,
                    "name": user?.name,
                    "profileImage": user?.profileImage
                }
			}

			const posts = []

			const post = await database.collection("posts")
				.findOne({
					"user._id": user?._id
				})

			if (post != null) {
				posts.push(post)
			}

			result.json({
				"status": "success",
				"message": "Record has been fetched.",
				"group": group,
				"data": posts
			})
		})

		app.post("/toggleJoinGroup", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		});

		app.get("/notifications", function (request, result) {
			result.render("notifications");
		});

		app.post("/acceptRequestJoinGroup", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		});

		app.post("/markNotificationsAsRead", function (request, result) {
			var accessToken = request.fields.accessToken;

			database.collection("users").findOne({
				"accessToken": accessToken
			}, function (error, user) {
				if (user == null) {
					result.json({
						"status": "error",
						"message": "User has been logged out. Please login again."
					});
				} else {

					if (user.isBanned) {
						result.json({
							"status": "error",
							"message": "You have been banned."
						});
						return false;
					}

					database.collection("users").updateMany({
						$and: [{
							"accessToken": accessToken
						}, {
							"notifications.isRead": false
						}]
					}, {
						$set: {
							"notifications.$.isRead": true
						}
					}, function (error, data) {
						result.json({
							"status": "success",
							"message": "Notifications has been marked as read."
						});
					});
				}
			});
		});

		app.post("/rejectRequestJoinGroup", function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		});

		app.post("/sharePost", async function (request, result) {

			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;
			var type = "shared";
			var createdAt = new Date().getTime();

			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}		

			const post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return
			}

			await database.collection("posts").updateOne({
				"_id": ObjectId(_id)
			}, {
				$push: {
					"shares": {
						"_id": user._id,
						"name": user.name,
						"username": user.username,
						"profileImage": user.profileImage,
						"createdAt": new Date().getTime()
					}
				}
			})

			await database.collection("posts").insertOne({
				"caption": post.caption,
				"image": post.image,
				"video": post.video,
				"savedPaths": post.savedPaths,
				"youtube_url": post.youtube_url,
				"type": type,
				"createdAt": createdAt,
				"likers": [],
				"comments": [],
				"shares": [],
				link: post.link,
				"user": {
					"_id": user._id,
					"name": user.name,
					"gender": user.gender,
					"profileImage": user.profileImage
				},
				originalPost: {
					_id: post._id,
					user: {
						_id: post.user._id,
						name: post.user.name,
						username: post.user.username
					}
				}
			})

			await database.collection("users").updateOne({
				$and: [{
					"_id": post.user._id
				}, {
					"posts._id": post._id
				}]
			}, {
				$push: {
					"posts.$[].shares": {
						"_id": user._id,
						"name": user.name,
						"profileImage": user.profileImage
					}
				}
			})

			if (user._id.toString() != post.user._id.toString()) {
				if (post.type == "post") {
					await database.collection("users").updateOne({
						"_id": post.user._id
					}, {
						$push: {
							"notifications": {
								"_id": ObjectId(),
								"type": "post_shared",
								"content": user.name + " has shared your post.",
								"profileImage": user.profileImage,
								"isRead": false,
								"post": {
									"_id": post._id
								},
								"createdAt": new Date().getTime()
							}
						}
					})
				}
			}

			result.json({
				"status": "success",
				"message": "Post has been shared."
			})
		})

		app.post("/sharePostInPage", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/sharePostInGroup", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		});

		app.post("/getPostById", async function (request, result) {
			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			});

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				});
				return false;
			}

			var post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			});

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				});
				return false;
			}

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"post": post
			});
		});

		app.post("/editPost", async function (request, result) {
			editPost.execute(request, result);
		});

		app.post("/deletePost", async function (request, result) {
			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			});

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				});
				return false;
			}

			var post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			});

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				});
				return false;
			}

			var isMyUploaded = false;

			if (post.type == "group_post") {
				isMyUploaded = (post.uploader._id.toString() == user._id.toString());
			} else {
				isMyUploaded = (post.user._id.toString() == user._id.toString());
			}

			if (!isMyUploaded) {
				result.json({
					"status": "error",
					"message": "Sorry, you do not own this post."
				});
				return false;
			}

			if (post.savedPaths != null) {
				for (let a = 0; a < post.savedPaths.length; a++) {
					fileSystem.unlink(post.savedPaths[a], function (error) {
						if (error) {
							console.error(error)
						}
					})
				}
			}

			if (post.image) {
				fileSystem.unlink(post.image, function (error) {
					if (error) {
						console.error(error)
					}
				})
			}

			if (post.video) {
				fileSystem.unlink(post.video, function (error) {
					if (error) {
						console.error(error)
					}
				})
			}

			if (post.audio) {
				fileSystem.unlink(post.audio, function (error) {
					if (error) {
						console.error(error)
					}
				})
			}

			if (post.document) {
				fileSystem.unlink(post.document, function (error) {
					if (error) {
						console.error(error)
					}
				})
			}

			await database.collection("posts").deleteOne({
				_id: post._id
			})

			result.json({
				status: "success",
				message: "Post has been deleted."
			})
		})

		app.post("/fetch-more-posts", async function (request, result) {
			var accessToken = request.fields.accessToken;
			var start = parseInt(request.fields.start);

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			});

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				});
				return false;
			}

			var ids = [];
			ids.push(user._id);

			for (var a = 0; a < user.pages.length; a++) {
				ids.push(user.pages[a]._id);
			}

			for (var a = 0; a < user.groups.length; a++) {
				if (user.groups[a].status == "Accepted") {
					ids.push(user.groups[a]._id);
				}
			}

			for (var a = 0; a < user.friends.length; a++) {
	            if (user.friends[a].status == "Accepted") {
					ids.push(user.friends[a]._id);
	            }
			}

			const posts = await database.collection("posts")
				.find({
					"user._id": {
						$in: ids
					}
				})
				.sort({
					"createdAt": -1
				})
				.skip(start)
				.limit(5)
				.toArray();

			result.json({
				"status": "success",
				"message": "Record has been fetched",
				"data": posts
			});
		});

		app.post("/showStoryDislikers", async function (request, result) {
			var accessToken = request.fields.accessToken
			var _id = request.fields._id

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return false
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}

			const dislikers = []
			dislikers.push({
				"_id": user._id,
				"name": user.name,
				"username": user.username,
				"profileImage": user.profileImage,
				"createdAt": new Date().getTime()
			})

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": dislikers
			})
		})

		app.post("/showPostDislikers", async function (request, result) {
			var accessToken = request.fields.accessToken
			var _id = request.fields._id

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return false
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}

			var post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return false
			}

			const dislikers = post.dislikers || []

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": dislikers
			})
		})

		app.post("/showStoryLikers", async function (request, result) {
			var accessToken = request.fields.accessToken
			var _id = request.fields._id

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return false
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}

			const likers = []
			likers.push({
				"_id": user._id,
				"name": user.name,
				"username": user.username,
				"profileImage": user.profileImage,
				"createdAt": new Date().getTime()
			})

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": likers
			})
		})

		app.post("/showPostLikers", async function (request, result) {
			var accessToken = request.fields.accessToken
			var _id = request.fields._id

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			})

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				})

				return false
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				})

				return false
			}

			var post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			})

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				})

				return false
			}

			const likers = post.likers || []

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": likers
			})
		})

		app.post("/showPostSharers", async function (request, result) {
			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;

			var user = await database.collection("users").findOne({
				"accessToken": accessToken
			});

			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}

			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				});
				return false;
			}

			var post = await database.collection("posts").findOne({
				"_id": ObjectId(_id)
			});

			if (post == null) {
				result.json({
					"status": "error",
					"message": "Post does not exist."
				});
				return false;
			}

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": post.shares
			});
		});

		app.get("/customer-support", function (request, result) {
			result.render("customer-support");
		});

		app.post("/createTicket", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			});
		});

		app.post("/getMyAllTickets", async function (request, result) {
			var accessToken = request.fields.accessToken;
			
			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			});
			
			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}
			
			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				});
				return false;
			}

			var data = []
			data.push({
				"description": "Dummy ticket",
				"user": {
					"_id": user._id,
					"name": user.name,
					"username": user.username,
					"profileImage": user.profileImage
				},
				"status": "open", // closed
				"comments": [{
	                "user": {
	                    "_id": user._id,
	                    "name": user.name,
	                    "username": user.username,
	                    "profileImage": user.profileImage
	                },
	                "comment": "Dummy comment",
	                "createdAt": new Date().getTime()
				}],
				"createdAt": new Date().getTime()
			})

			data = data.reverse();

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": data
			});
		});

		app.get("/editTicket", async function (request, result) {
			result.render("editTicket");
		});

		app.post("/getTicket", async function (request, result) {
			var accessToken = request.fields.accessToken;
			var _id = request.fields._id;
			
			const user = await database.collection("users").findOne({
				"accessToken": accessToken
			});
			
			if (user == null) {
				result.json({
					"status": "error",
					"message": "User has been logged out. Please login again."
				});
				return false;
			}
			
			if (user.isBanned) {
				result.json({
					"status": "error",
					"message": "You have been banned."
				});
				return false;
			}

			const data = {
				"description": "Dummy ticket",
				"user": {
					"_id": user._id,
					"name": user.name,
					"username": user.username,
					"profileImage": user.profileImage
				},
				"image": "uploads/steve-jobs.jpg",
				"video": "uploads/video.mp4",
				"status": "open", // closed
				"comments": [{
	                "user": {
	                    "_id": user._id,
	                    "name": user.name,
	                    "username": user.username,
	                    "profileImage": user.profileImage
	                },
	                "comment": "Dummy comment",
	                "createdAt": new Date().getTime()
				}],
				"createdAt": new Date().getTime()
			}

			result.json({
				"status": "success",
				"message": "Data has been fetched.",
				"data": data
			});
		});

		app.post("/editTicket", async function (request, result) {
			result.json({
				"status": "error",
				"message": message_premium
			})
		})

		app.post("/deleteTicket", async function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			})

		});

		app.get("/tickets/detail", function (request, result) {
            result.render("tickets/detail")
        })
		
		app.post("/tickets/add-comment", async function (request, result) {

			result.json({
				"status": "error",
				"message": message_premium
			})
			
        })
	});
});