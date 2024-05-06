const ObjectId = require("mongodb").ObjectId

module.exports = {

    database: null,
    functions: null,
    fileSystem: null,
    requestModule: null,
    filter: null,
    ObjectId: null,

    request: null,
    result: null,

    image: "",
    video: "",
    audio: "",
    document: "",
    savedPaths: [],
    type: "",
    user: null,
    _id: null,
    mainURL: "",

    callbackFileUpload: function(files, index, savedPaths = [], success = null) {
        const self = this

        if (files.length > index) {

            this.fileSystem.readFile(files[index].path, function (error, data) {
                if (error) {
                    console.error(error)
                    return
                }

                if (files[index].size > 0) {
                    const filePath = "uploads/" + new Date().getTime() + "-" + files[index].name
                    const base64 = new Buffer(data).toString('base64')

                    if (files[index].type.includes("image")) {
                        self.requestModule.post("http://127.0.0.1:8888/scripts/social-networking-site/class.ImageFilter.php", {
                            formData: {
                                "validate_image": 1,
                                "base_64": base64
                            }
                        }, function(err, res, body) {
                            if (!err && res.statusCode === 200) {
                                // console.log(body);

                                if (body > 60) {
                                    self.result.json({
                                        "status": "error",
                                        "message": "Image contains nudity."
                                    });

                                    return false;
                                } else {
                                    self.fileSystem.writeFile(filePath, data, async function (error) {
                                        if (error) {
                                            console.error(error)
                                            return
                                        }

                                        savedPaths.push(filePath)

                                        if (index == (files.length - 1)) {
                                            success(savedPaths)
                                        } else {
                                            index++
                                            self.callbackFileUpload(files, index, savedPaths, success)
                                        }
                                    })

                                    self.fileSystem.unlink(files[index].path, function (error) {
                                        if (error) {
                                            console.error(error)
                                            return
                                        }
                                    })
                                }
                            }
                        })
                    } else {
                        self.fileSystem.writeFile(filePath, data, async function (error) {
                            if (error) {
                                console.error(error)
                                return
                            }

                            savedPaths.push(filePath)

                            if (index == (files.length - 1)) {
                                success(savedPaths)
                            } else {
                                index++
                                self.callbackFileUpload(files, index, savedPaths, success)
                            }
                        })

                        self.fileSystem.unlink(files[index].path, function (error) {
                            if (error) {
                                console.error(error)
                                return
                            }
                        })
                    }
                } else {
                    index++
                    self.callbackFileUpload(files, index, savedPaths, success)
                }
            })
        } else {
            success(savedPaths)
        }
    },

    execute: async function (request, result) {
        var accessToken = request.fields.accessToken;
        var caption = request.fields.caption;
        var image = "";
        var video = "";
        var type = request.fields.type;
        var createdAt = new Date().getTime();
        var base64 = request.fields.imgData;

        this.image = ""
        this.video = ""
        this.audio = ""
        this.document = ""
        this.savedPaths = []

        var self = this;

        this.type = type;
        this.request = request;
        this.result = result;

        // in case of post in page or group
        var _id = request.fields._id;
        this._id = _id;

        var user = await this.database.collection("users").findOne({
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

        if (this.filter.isProfane(caption)) {
            result.json({
                "status": "error",
                "message": "Your message contains abusive or offensive language."
            });

            return false;
        }

        if (this.type == "page_post" || this.type == "group_post") {
            result.json({
                "status": "error",
                "message": message_premium
            });

            return false;
        }

        this.user = user;

        const files = []
        if (Array.isArray(request.files.files)) {
            for (let a = 0; a < request.files.files.length; a++) {
                files.push(request.files.files[a])
            }
        } else {
            files.push(request.files.files)
        }

        this.callbackFileUpload(files, 0, [], async function (savedPaths) {
            self.savedPaths = savedPaths
            self.fileUpload_moveForward()
        })
    },

    fileUpload_moveForward: async function () {
        var _id = this.ObjectId();
        var link = mainURL + "/post/" + _id;

        const youtube_url = this.request.fields.youtube_url

        const videos = []
        for (let a = 0; a < this.savedPaths.length; a++) {
            const parts = this.savedPaths[a].split(".")
            const extension = parts[parts.length - 1]
            if (extension == "mp4" || extension == "mov" || extension == "mkv") {
                videos.push({
                    src: this.savedPaths[a],
                    viewers: []
                })
            }
        }

        var postObj = {
            "_id": _id,
            "caption": this.request.fields.caption,
            "image": this.image,
            "video": this.video,
            "audio": this.audio,
            "document": this.document,
            "savedPaths": this.savedPaths,
            videos: videos,
            "youtube_url": youtube_url,
            "type": this.type,
            isBoost: false,
            "createdAt": new Date().getTime(),
            "likers": [],
            "dislikers": [],
            "comments": [],
            "shares": [],
            "link": link,
            "user": {
                "_id": this.user._id,
                "name": this.user.name,
                "username": this.user.username,
                "profileImage": this.user.profileImage
            }
        };

        await this.database.collection("posts").insertOne(postObj);

        this.result.json({
            "status": "success",
            "message": "Post has been uploaded.",
            "postObj": postObj
        });

        return true;
    }
};