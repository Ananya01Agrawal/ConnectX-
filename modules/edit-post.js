const fileSystem = require("fs")
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
    type: "",
    user: null,
    post: null,

    callbackFileUpload: function(files, index, savedPaths = [], success = null) {
        const self = this

        if (files.length > index) {

            fileSystem.readFile(files[index].path, function (error, data) {
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
                                    fileSystem.writeFile(filePath, data, async function (error) {
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

                                    fileSystem.unlink(files[index].path, function (error) {
                                        if (error) {
                                            console.error(error)
                                            return
                                        }
                                    })
                                }
                            }
                        })
                    } else {
                        fileSystem.writeFile(filePath, data, async function (error) {
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

                        fileSystem.unlink(files[index].path, function (error) {
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
        var accessToken = request.fields.accessToken
        var caption = request.fields.caption
        var _id = request.fields._id
        var image = ""
        var video = ""
        var type = request.fields.type
        var createdAt = new Date().getTime()
        var base64 = request.fields.imgData
        const youtube_url = request.fields.youtube_url

        this.image = ""
        this.video = ""
        this.audio = ""
        this.document = ""
        this.savedPaths = []

        var self = this

        this.type = type
        this.request = request
        this.result = result

        // in case of post in page or group
        var _id = request.fields._id
        this._id = _id

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

        if (this.filter.isProfane(caption)) {
            result.json({
                status: "error",
                message: "Your message contains abusive or offensive language."
            })

            return
        }

        const post = await database.collection("posts").findOne({
            _id: ObjectId(_id)
        })

        if (post == null) {
            result.json({
                status: "error",
                message: "Post does not exist."
            })

            return
        }

        if (type == "post") {
            if (post.user._id.toString() != user._id.toString()) {
                result.json({
                    status: "error",
                    message: "Sorry, you do not own this post."
                })

                return
            }
        } else if (type == "page_post") {

            result.json({
                status: "error",
                message: message_premium
            })

            return

        } else if (type == "group_post") {
            result.json({
                status: "error",
                message: message_premium
            })

            return
        }

        this.user = user

        const files = []
        if (Array.isArray(request.files.files)) {
            for (let a = 0; a < request.files.files.length; a++) {
                files.push(request.files.files[a])
            }
        } else {
            files.push(request.files.files)
        }

        this.callbackFileUpload(files, 0, [], async function (savedPaths) {
            
            const videos = post.videos || []
            const postSavedPaths = post.savedPaths || []

            for (let a = 0; a < savedPaths.length; a++) {
                const parts = savedPaths[a].split(".")
                const extension = parts[parts.length - 1]
                if (extension == "mp4" || extension == "mov" || extension == "mkv") {
                    videos.push({
                        src: savedPaths[a],
                        viewers: []
                    })
                }
                postSavedPaths.push(savedPaths[a])
            }

            await database.collection("posts").findOneAndUpdate({
                _id: post._id
            }, {
                $set: {
                    caption: caption,
                    youtube_url: youtube_url,
                    videos: videos,
                    savedPaths: postSavedPaths
                }
            })

            const postObj = await database.collection("posts").findOne({
                _id: post._id
            })

            result.json({
                status: "success",
                message: "Post has been uploaded.",
                post: postObj
            })

            return
        })

        return
    }
};