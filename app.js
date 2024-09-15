var itemIds = [];
var itemList = [];
var itemLimit = 20;
var offset = 0;
var busy = false;
var scrollThrottle = null;
var ajaxTimeout = null;
var lastUpdateTime = Date.now();
var checkInterval = 60000; // Check for updates every minute

// Can be list, post, or user.
var pageType = 'list';
var currentSection = 'stories';

var baseURL = 'https://hacker-news.firebaseio.com/v0';

function changeSection(section) {
    currentSection = section;
    itemIds = [];
    itemList = [];
    offset = 0;
    $('#content').empty();
    $('#content').addClass('hidden');
    $('#scroll_text').addClass('hidden');

    $('#navbar a').removeClass('active');
    $('#nav-' + section).addClass('active');

    var endpoint;
    switch (section) {
        case 'jobs':
            endpoint = '/jobstories.json';
            break;
        case 'polls':
            endpoint = '/askstories.json';
            break;
        case 'newest':
            endpoint = '/newstories.json';
            break;
        default:
            endpoint = '/topstories.json';
    }

    $.ajax(baseURL + endpoint).done(function (topItems) {
        console.log("Received items for " + section + ":", topItems);

        itemIds = topItems;
        offset = 0;
        itemList = [];
        $('#content').empty();
        getMoreItems(topItems, offset);
        if (section === 'newest') {
            startUpdates();
        } else {
            stopUpdates();
        }
    });
    lastUpdateTime = Date.now();
    $('#update_notification').addClass('hidden');
}

function getMoreItems(ids, start) {
    var end = Math.min(start + itemLimit, ids.length);
    var itemsToLoad = ids.slice(start, end);

    var requests = itemsToLoad.map(function (id) {
        return $.ajax(baseURL + '/item/' + id + '.json');
    });

    $.when.apply($, requests).done(function () {
        var results = Array.prototype.slice.call(arguments);
        results.forEach(function (result) {
            var item = result[0];
     if (currentSection === 'polls' ? (item.type === 'poll' || item.type === 'story') : true) {
    itemList.push(item);
    $('#content').append(entryFormat(item));
}
        });

        offset = end;
        busy = false;

        if (end >= ids.length) {
            $('#scroll_text').text('No more items to load');
        } else if (currentSection === 'polls' && $('#content').children().length < itemLimit) {
            getMoreItems(ids, end);
        }
    });
}

function formatDateTime(unixTimestamp) {
    var date = new Date(unixTimestamp * 1000);
    return date.toLocaleString();
}

function updateNewestStories() {
    if (currentSection === 'newest') {
        $('#update_notification').text('Checking for updates...').removeClass('hidden');
        $.ajax(baseURL + '/newstories.json').done(function (newItems) {
            var latestItemId = newItems[0];
            if (latestItemId > itemIds[0]) {
                var newItemsToFetch = newItems.slice(0, newItems.indexOf(itemIds[0]));
                var requests = newItemsToFetch.map(function (id) {
                    return $.ajax(baseURL + '/item/' + id + '.json');
                });

                $.when.apply($, requests).done(function () {
                    var results = Array.prototype.slice.call(arguments);
                    results.forEach(function (result) {
                        var item = result[0];
                        itemIds.unshift(item.id);
                        itemList.unshift(item);
                    });

                    $('#update_notification').text(results.length + ' new stories added! Click to refresh').removeClass('hidden');
                    $('#update_notification').one('click', function() {
                        changeSection('newest');
                        $(this).addClass('hidden');
                    });
                });
            } else {
                $('#update_notification').text('No new stories').removeClass('hidden');
                setTimeout(function () {
                    $('#update_notification').addClass('hidden');
                }, 3000);
            }
        });
    }
}

var updateInterval;

function startUpdates() {
    updateInterval = setInterval(function () {
        if (currentSection === 'newest') {
            updateNewestStories();
        }
    }, 30000); // Check every 30 seconds
}

function stopUpdates() {
    clearInterval(updateInterval);
}

function entryFormat(data, full) {
    var link;
    if (data.type === 'poll') {
        link = '<a class="lead" href="#" onclick="viewItem(this)" data-id="' + data.id + '">' + data.title + ' [poll]</a>';
    } else {
        link = data.url ?
            '<a class="lead" target="_blank" href="' + data.url + '">' + data.title + '</a>' :
            '<a class="lead" href="#" onclick="viewItem(this)" data-id="' + data.id + '">' + data.title + '</a>';
    }
    var comments = data.kids ? data.kids.length : 0;
    var commentLink = full ? ''
        : '| <b><span class="comment_link" data-id="' + data.id + '" onclick="viewItem(this)">' + comments + ' comments</span></b>';
    var dateTime = '<span class="post-date">' + formatDateTime(data.time) + '</span>';
    var score = data.type === 'poll' ? data.score + ' points' : '';
    var entryArgs = [
        '<div class="item_entry">',
        link,
        '<p>',
        score,
        data.type !== 'poll' ? 'by ' + data.by : '',
        ' | ' + dateTime,
        commentLink,
        '</p>',
        '</div>',
    ];

    var blurb = entryArgs.join(' ');
    var extra = '<p>' + (data.text || '') + '</p>' + '<h3>' + comments + ' comments</h3>';

    if (full)
        return blurb + extra;
    return blurb;
}

function getPollOptions(pollId) {
    return $.ajax(baseURL + '/item/' + pollId + '.json').then(function (poll) {
        var optionPromises = poll.parts.map(function (partId) {
            return $.ajax(baseURL + '/item/' + partId + '.json');
        });

        return $.when.apply($, optionPromises).then(function () {
            var options = Array.prototype.slice.call(arguments);
            var optionsHtml = '<div class="poll-options">';
            options.forEach(function (option) {
                optionsHtml += '<div class="poll-option">';
                optionsHtml += '<p>' + option[0].text + '</p>';
                optionsHtml += '<p>Score: ' + option[0].score + '</p>';
                optionsHtml += '</div>';
            });
            optionsHtml += '</div>';
            return optionsHtml;
        });
    });
}

function viewItem(item) {
    var id = $(item).data('id'),
        item = itemList.filter(function (item) { return item.id === id; }).pop(),
        numComments = item.kids ? item.kids.length : 0;

    history.pushState({}, "", "item/" + id);
    $('#item_meta').html(entryFormat(item, /* full */ true));
    $('#front_page').addClass('hidden');
    $('#title').addClass('hidden');
    $('#navbar').addClass('hidden');
    $('#item').removeClass('hidden');
    $('#back_button').removeClass('hidden');
    pageType = 'post';

    if (item.type === 'poll') {
        getPollOptions(id).then(function (pollOptionsHtml) {
            $('#item_meta').append(pollOptionsHtml);
        });
    }

    getTopComments(item);
}

function getTopComments(item) {
    var commentIds = item.kids;

    $('#comment_field').empty();

    // Return if no comments
    if (!commentIds) {
        return;
    }

    getCommentsRecursive(commentIds, $('#comment_field'));
}

function getCommentsRecursive(commentIds, parentElement) {
    if (!commentIds || commentIds.length === 0) {
        return $.Deferred().resolve();
    }

    var requests = commentIds.map(function (commentId) {
        return $.ajax(baseURL + '/item/' + commentId + '.json');
    });

    return $.when.apply($, requests).then(function () {
        var comments = Array.prototype.slice.call(arguments);
        var results = comments.map(function (comment) {
            return comment[0];
        }).filter(function (comment) {
            return comment !== undefined;
        });

        // Sort comments by time, latest first
        results.sort(function (a, b) {
            return b.time - a.time;
        });

        var promises = results.map(function (comment) {
            var commentElement = createCommentElement(comment);
            parentElement.append(commentElement);

            if (comment && comment.kids && comment.kids.length > 0) {
                var childrenContainer = $('<div class="comment_children"></div>');
                commentElement.append(childrenContainer);
                return getCommentsRecursive(comment.kids, childrenContainer);
            } else {
                return $.Deferred().resolve();
            }
        });

        return $.when.apply($, promises);
    });
}

function createCommentElement(comment) {
    if (!comment.text || comment.deleted) {
        return $('<div class="comment_blurb"><p><strong>[Deleted]</strong></p><p>[This comment has been deleted]</p></div>');
    }
    var text = comment.text;
    var by = '<strong>' + comment.by + '</strong>';
    var time = '<span class="time_since">' + getDateSincePost(comment.time) + '</span>';
    var commentElement = $('<div class="comment_blurb"></div>');
    commentElement.append($('<p>' + by + ' ' + time + '</p>'));

    commentElement.append($('<p>' + text + '</p>'));
    return commentElement;
}

function backToFrontPage() {
    history.back();
    $('#item').addClass('hidden');
    $('#back_button').addClass('hidden');
    $('#front_page').removeClass('hidden');
    $('#title').removeClass('hidden');
    $('#navbar').removeClass('hidden');
    pageType = 'list';
}

function getDateSincePost(postDate) {
    var timeSince = (Date.now() / 1000) - postDate;
    var days = Math.floor(timeSince / (60 * 60 * 24));

    if (days)
        return days + " days ago";

    var hours = Math.floor(timeSince / (60 * 60));

    if (hours)
        return hours + " hours ago";

    var minutes = Math.floor(timeSince / 60);

    return minutes + " minutes ago";
}

$(window).scroll(function () {
    clearTimeout(scrollThrottle);
    scrollThrottle = setTimeout(function () {
        if (pageType === 'list') {
            if (!busy && $(window).scrollTop() + $(window).height() >= $(document).height() - 100) {
                busy = true;
                getMoreItems(itemIds, offset);
            }
            if ($(window).scrollTop() === 0) {
                $('#update_notification').addClass('hidden');
            }
        }
    }, 300);
});

$(document).ajaxComplete(function () {
    clearTimeout(ajaxTimeout);
    ajaxTimeout = setTimeout(function () {
        $('#content').removeClass('hidden');
        $('#scroll_text').removeClass('hidden');
    }, 300);
});

// Initial load
changeSection('stories');