/*jslint node: true, indent: 4 */
'use strict';
var async = require('async');
var discourse,
    conf;

exports.description = 'Issue Likes to all posts in a thread';

exports.configuration = {
    enabled: false,
    follow: false,
    binge: false,
    bingeHour: 23,
    bingeMinute: 30,
    topic: 1000
};

exports.name = 'AutoLikes';

exports.priority = 0;

exports.version = '1.13.0';

function format(str, dict) {
    for (var name in dict) {
        str = str.replace(new RegExp('%' + name + '%', 'g'), dict[name]);
    }
    return str;
}

function binge(callback) {
    var msg = 'Liking /t/%TOPIC%/%POST% by @%USER%';
    discourse.getAllPosts(conf.topic, function (posts, next) {
        var likeables = posts.filter(function (x) {
            var action = x.actions_summary.filter(function (y) {
                return y.id === 2;
            });
            return action && action[0].can_act;
        });
        async.each(likeables, function (post, flow) {
            discourse.log(format(msg, {
                'TOPIC': post.topic_id,
                'POST': post.post_number,
                'USER': post.username
            }));
            discourse.postAction('like', post.id, function (err, resp) {
                flow(err || resp.statusCode === 429);
            });
        }, next);
    }, function () {
        callback();
    });
}

function scheduleBinges() {
    async.forever(function (cb) {
        var now = new Date(),
            utc = new Date(),
            hours,
            minutes;
        utc.setUTCHours(conf.bingeHour);
        utc.setUTCMinutes(conf.bingeMinute);
        utc.setUTCSeconds(0);
        utc.setMilliseconds(0);
        now = now.getTime();
        utc = utc.getTime();
        if (now > utc) {
            // add a day if scheduling after 23:40 UTC
            utc += 24 * 60 * 60 * 1000;
        }
        minutes = Math.ceil(((utc - now) / 1000) / 60);
        hours = Math.floor(minutes / 60);
        minutes = minutes % 60;
        discourse.log('Like Binge scheduled for ' + hours + 'h' +
            minutes + 'm from now');
        setTimeout(function () {
            binge(cb);
        }, utc - now);
    });
}


exports.onMessage = function onMessage(message, post, callback) {
    if (message.data && message.data.type === 'created') {
        if (post) {
            discourse.log('Liking Post /t/' + post.topic_id +
                '/' + post.post_number + ' by @' + post.username);
        } else {
            discourse.log('Liking Post #' + message.data.id);
        }
        discourse.postAction('like', message.data.id, callback);
    } else {
        callback();
    }
};

exports.registerListeners = function registerListeners(callback) {
    if (conf.enabled && conf.follow) {
        if (typeof conf.topic === 'number') {
            callback(null, ['/topic/' + conf.topic]);
        } else {
            callback(null, conf.topic.map(function (v) {
                return '/topic/' + v;
            }));
        }
    } else {
        callback();
    }
};

exports.begin = function begin(browser, config) {
    conf = config.modules[exports.name];
    discourse = browser;
    if (conf.enabled && conf.binge) {
        scheduleBinges();
    }
};
