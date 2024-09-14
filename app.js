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
            switch(section) {
                case 'jobs':
                    endpoint = '/jobstories.json';
                    break;
                case 'polls':
                    endpoint = '/pollstories.json';
                    break;
                case 'newest':
                    endpoint = '/newstories.json';
                    break;
                default:
                    endpoint = '/topstories.json';
            }

            $.ajax(baseURL + endpoint).done(function(topItems) {
                itemIds = topItems;
                getMoreItems(topItems, offset);
            });
            lastUpdateTime = Date.now();
            $('#update_notification').addClass('hidden');

            if (section === 'newest') {
                startUpdates();
            } else {
                stopUpdates();
            }
        }

        function formatDateTime(unixTimestamp) {
            var date = new Date(unixTimestamp * 1000);
            return date.toLocaleString();
        }

        function updateNewestStories() {
            if (currentSection === 'newest') {
                $.ajax(baseURL + '/newstories.json').done(function(newItems) {
                    var newStories = newItems.slice(0, 20);
                    var requests = newStories.map(function(item) {
                        return $.ajax(baseURL + '/item/' + item + '.json');
                    });

                    $.when.apply($, requests).done(function() {
                        var results = Array.prototype.slice.call(arguments, 0).map(function(array) {
                            return array[0];
                        });

                        $('#content').empty();
                        results.forEach(function(result) {
                            $('#content').append(entryFormat(result));
                        });
                        $('#content').removeClass('hidden');
                        $('#update_notification').text('Newest stories updated!').removeClass('hidden');
                        setTimeout(function() {
                            $('#update_notification').addClass('hidden');
                        }, 3000);
                    });
                });
            }
        }

        var updateInterval;

        function startUpdates() {
            updateInterval = setInterval(function() {
                if (currentSection === 'newest') {
                    updateNewestStories();
                }
            }, 5000);
        }

        function stopUpdates() {
            clearInterval(updateInterval);
        }

        /**
         * Grabs more items from the top 100 list, with the given offset.
         */
        function getMoreItems(topItems, offset) {
           topItems = topItems.slice(offset, offset + itemLimit);

           var requests = topItems.map(function(item) {
              var itemData = $.ajax(baseURL + '/item/' + item + '.json');

              return itemData;
           });

           $.when.apply($, requests).done(function() {
              var results = Array.prototype.slice.call(arguments, 0).map(function(array) {
                 return array[0];
              });

              results.forEach(function(result) {
                 itemList.push(result);
                 $('#content').append(entryFormat(result));
              });
           });

           this.offset += 20;
           if (this.offset >= 100) {
              $('#scroll_text').hide();
              $(window).unbind('scroll');
           }
           busy = false;
        }

        /**
         * Throws all parts of an item div into an array and then joins it with spaces.
         */
        function entryFormat(data, full) {
           var link = data.url ? 
               '<a class="lead" target="_blank" href="' + data.url + '">' + data.title + '</a>' :
               '<a class="lead" href="#" onclick="viewItem(this)" data-id="' + data.id + '">' + data.title + '</a>',
               comments = data.kids ? data.kids.length : 0,
               commentLink =  full ? ''
                : '| <b><span class="comment_link" data-id="' + data.id + '" onclick="viewItem(this)">' + comments + ' comments</span></b>',
               dateTime = '<span class="post-date">' + formatDateTime(data.time) + '</span>',
               entryArgs = [
                 '<div class="item_entry">',
                 link,
                 '<p>',
                 data.score,
                 'points',
                 ' by ' + data.by,
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
        };

        // ITEM SPECIFIC STUFF

        // Grab item from id, populate item_fields with information
        function viewItem(item) {
           var id = $(item).data('id'),
               item = itemList.filter(function(item) {return item.id === id;} ).pop(),
               numComments = item.kids ? item.kids.length : 0;

           history.pushState({}, "", "comments/" + id);
           $('#item_meta').html(entryFormat(item, /* full */ true));
           $('#front_page').addClass('hidden');
           $('#title').addClass('hidden');
           $('#navbar').addClass('hidden');
           $('#item').removeClass('hidden');
           $('#back_button').removeClass('hidden');
           pageType = 'post';

           // Use $.when.apply($, objs) to wait for multiple objects
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

           var requests = commentIds.map(function(commentId) {
              return $.ajax(baseURL + '/item/' + commentId + '.json');
           });

           return $.when.apply($, requests).then(function() {
              var comments = Array.prototype.slice.call(arguments);
              var results = comments.map(function(comment) {
                 return comment[0];
              });

              var promises = results.map(function(comment) {
                 var commentElement = createCommentElement(comment);
                 parentElement.append(commentElement);

                 if (comment.kids && comment.kids.length > 0) {
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
           var text = comment.deleted ? '[Deleted]' : comment.text;
           var by = '<strong>' + (comment.deleted ? '[Deleted]' : comment.by) + '</strong>';
           var time = '<span class="time_since">' + getDateSincePost(comment.time) + '</span>';
           return $('<div class="comment_blurb"><p>' + by + ' ' + time + '</p><p>' + text + '</p></div>');
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

        /**
         * Display time difference in days, hours, or minutes.
         */
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

        $(window).scroll(function() {
           clearTimeout(scrollThrottle);
           scrollThrottle = setTimeout(function() {
              if (pageType === 'list') {
                 if (!busy && $(window).scrollTop() + $(window).height() == $(document).height()) {
                    busy = true;
                    getMoreItems(itemIds, offset);
                 }
                 if ($(window).scrollTop() === 0) {
                    $('#update_notification').addClass('hidden');
                 }
              }
           }, 300);
        });

        /**
         * Wait until it has been 300 ms since the last AJAX completion to show the
         * content.
         */
        $(document).ajaxComplete(function() {
           clearTimeout(ajaxTimeout);
           ajaxTimeout = setTimeout(function() {
              $('#content').removeClass('hidden');
              $('#scroll_text').removeClass('hidden');
           }, 300);
        });

        // Initial load
        changeSection('stories');