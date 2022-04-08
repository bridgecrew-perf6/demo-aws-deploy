// The workerSrc property shall be specified.
PDFJS.workerSrc = 'plugins/pdf/pdf.worker.js';
PDFJS.cMapUrl = 'plugins/pdf/cmap/';
PDFJS.cMapPacked = true;

var pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = CC_PDFSCALE,
    container = document.getElementById("cc-container"),
    canvas = document.createElement("canvas"),
    ctx = canvas.getContext('2d'),
    droppable = $("#cc-container").attr("droppable");

/**
 * Get page info from document, resize canvas accordingly, and render page.
 * @param num Page number.
 */
function renderPage(num) {
    pageRendering = true;
    // Using promise to fetch the page
    pdfDoc.getPage(num).then(function(page) {
        var viewport = page.getViewport(scale);
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style = "border: 1px solid #f4f4f4;";
        if (droppable) canvas.id = "droppable";
        // Render PDF page into canvas context
        var renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        var div = document.createElement("div");
        var pagename = "cc-page-" + (page.pageIndex + 1);
        container.appendChild(div);
        div.setAttribute("id", pagename);
        div.setAttribute("style", "position: relative");
        div.appendChild(canvas);
        // -- Display Preview Page. -- //
        var signature = false;
        if ($("#cc-container-dummy")) {
            // ダミー要素から署名要素を抽出し、レンダリングされた要素に貼り付ける。
            var signatureCount = $("#cc-signatureCount").val();
            signatureCount = (signatureCount === "undefined") ? 0 : signatureCount;
            if (signatureCount != _checkSignedCount($("#cc-container"))) signature = true;
            var box = $("#cc-container-dummy").find(".ui-draggable");
            box.each(function() {
                if ($(this).parent()[0].id == pagename) {
                    // ページ毎に処理する。
                    $(this).css("cursor", "none").css("box-shadow", "0 0px 0px #ffffff");
                    $("#cc-container").find("canvas").before(this);
                }
            })

            // 署名済みテキストの処理（改行判定）
            var p = $("#" + pagename + "> div > p");
            p.each(function() {
                $(this).html($(this).context.innerHTML.replace(/\r?\n/g, "<br/>"));
            })

            // 署名欄の数だけ処理する。
            var textarea = $("#" + pagename + "> div > textarea");
            textarea.each(function() {
                // 署名欄記入後の動作
                $(this).blur(function() {
                    _checkValue($(this));
                    _checkDisableConcludedButton();
                })
            })
        }
        if (signature && signatureCount !== "multiple") {
            // 署名付きかつ複数者間契約でなければ、署名数をチェック
            _concludedButton(signatureCount - _checkSignedCount($("#cc-container")));
        } else {
            // 複数者間契約でなければ、末押印をチェック
            var electronicStampCount = _checkBlankElectronicStampCount($("#cc-container"));
            if (electronicStampCount > 0 && signatureCount !== "multiple") {
                _concludedButton(electronicStampCount);
            }
        }

        // -- Display droppedBox. -- //
        $("[id=droppedBox]").each(function() {
            if (pagename == $(this).context.parentElement.id) $(this).css("display", "block");
            else $(this).css("display", "none");
        })

        // -- Droppable Code. -- //
        if (droppable) {
            var pattern = "droppedBox";
            $("#droppable").droppable({
                over: function(e, ui) {
                    $("canvas").css("border", "2px solid #3c8dbc");
                },
                out: function(e, ui) {
                    $("canvas").css("border", "1px solid #f4f4f4");
                    if (!ui.draggable[0].id.indexOf(pattern)) {
                        ui.draggable.remove();
                    }
                },
                drop: function(e, ui) {
                    if (ui.draggable[0].id.indexOf(pattern)) {
                        var drag_elm = ui.draggable.clone();
                        drag_elm.css("top", ui.offset.top - $(this).offset().top)
                            .css("left", ui.offset.left - $(this).offset().left)
                            .css("position", "absolute")
                            .attr("id", pattern);
                        $(this).parent().prepend(drag_elm);
                        drag_elm.draggable({
                            zIndex: 1070
                        });
                        // remove checkbox placeholder and edit width
                        var $checkboxPlaceholder = drag_elm.find('.draggable-checkbox-placeholder');
                        if ($checkboxPlaceholder.length > 0) {
                            $checkboxPlaceholder.remove();
                        }
                        var $checkbox = drag_elm.find("input[type='checkbox']");
                        if ($checkbox.length > 0) {
                            drag_elm.css("width", "35px");
                            $checkbox.attr('disabled', false);
                            return // stop bind event to checkbox container
                        }

                        var $electricStampPlaceholder = drag_elm.find('.draggable-electric-stamp-placeholder');
                        if ($electricStampPlaceholder.length > 0) {
                            $electricStampPlaceholder.remove();
                        }
                        var $electricStampButton = drag_elm.find("button.electronic-stamp-button");
                        if ($electricStampButton.length > 0) {
                            var size = 90;
                            $electricStampButton.attr('id', new Date().getTime());
                            $electricStampButton.css('width', size + 'px').css('height', size + 'px');
                            var left = parseInt($electricStampButton.parent().parent().css('left'))
                            var top = parseInt($electricStampButton.parent().parent().css('top'))
                            left = left - (size / 2 - 30)
                            top = top - (size / 2 - 30)
                            $electricStampButton.parent().parent().css('left', left).css('top', top)
                            return;
                        }

                        var elm = $(drag_elm.children());
                        $(elm).blur(function() {
                            _checkValue(elm);
                        });
                        // textarea resize event.
                        $(elm).exResize(function() {
                            var width = (elm.outerWidth() > 100) ? elm.outerWidth() + 20 : 145;
                            drag_elm.css("width", width + "px");
                            drag_elm.css("height", elm.outerHeight() + 10 + "px");
                        });
                    }
                    $("canvas").css("border", "1px solid #f4f4f4");
                }
            });
        }

        var renderTask = page.render(renderContext);
        // Wait for rendering to finish
        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                // New page rendering is pending
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });

        renderTask.promise.then(function() {
            // Get text-fragments
            return page.getTextContent();
        }).then(function(textContent) {
            // Create div which will hold text-fragments
            var textLayerDiv = document.createElement("div");
            // Set it's class to textLayer which have required CSS styles
            textLayerDiv.setAttribute("class", "textLayer");
            // Append newly created div in `div#page-#{pdf_page_number}`
            div.appendChild(textLayerDiv);
            // Create new instance of TextLayerBuilder class
            var textLayer = new TextLayerBuilder({
                textLayerDiv: textLayerDiv,
                pageIndex: page.pageIndex,
                viewport: viewport
            });
            // Set text-fragments
            textLayer.setTextContent(textContent);
            // Render text-fragments
            textLayer.render();
            // Render Task is done.
            $(".overlay").attr("style", "display: none;");
        });
    });
    // Update page counters
    document.getElementById('page_num').textContent = pageNum;
}

function _checkValue(element) {
    if (element.val().match(/\S/g)) element.attr("value", element.val());
    else element.attr("value", "");
}

function _checkSignedCount(element) {
    var _signatureCount = 0;
    element.find("textarea").each(function() {
        if ($(this).val().match(/\S/g)) _signatureCount++;
    })
    return _signatureCount;
}

/**
 * _checkBlankElectronicStampCount
 * @param element
 * @returns {number}
 * @private
 */
function _checkBlankElectronicStampCount(element) {
    var _electronicStampCount = 0;
    element.find("button.electronic-stamp-button").each(function() {
        ($(this).find('>img').length < 1) && _electronicStampCount++;
    })
    return _electronicStampCount;
}

/**
 * _checkDisableConcludedButton
 * @returns {boolean}
 * @private
 */
function _checkDisableConcludedButton() {
    var signatureCount = $("#cc-signatureCount").val();
    signatureCount = (signatureCount === "undefined") ? 0 : signatureCount;
    var blankElectronicStampCount = _checkBlankElectronicStampCount($("#cc-container"));
    var checkSignedCountValue = _checkSignedCount($("#cc-container"));
    if ((signatureCount == checkSignedCountValue && blankElectronicStampCount == 0) || signatureCount === "multiple") {
        // 署名が終わった、もしくは複数者契約であれば締結ボタンを活性化させる。
        $("#cc-disc-signature").attr("style", "display:none;");
        $("#cc-document-concluded").prop('disabled', false);
    } else {
        signatureCount - checkSignedCountValue > 0 ? _concludedButton(signatureCount - checkSignedCountValue) : _concludedButton(blankElectronicStampCount)
    }
}
window.checkDisableConcludedButton = _checkDisableConcludedButton;

function _concludedButton(count) {
    $("#cc-disc-signature > span").text(count);
    $("#cc-disc-signature").attr("style", "display:block;");
    $("#cc-document-concluded").prop('disabled', true);
}

/**
 * If another page rendering in progress, waits until the rendering is
 * finised. Otherwise, executes rendering immediately.
 */
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

/**
 * Displays previous page.
 */
function onPrevPage() {
    if (pageNum <= 1) {
        return;
    }
    pageNum--;
    queueRenderPage(pageNum);
}
document.getElementById('prev').addEventListener('click', onPrevPage);

/**
 * Displays next page.
 */
function onNextPage() {
    if (pageNum >= pdfDoc.numPages) {
        return;
    }
    pageNum++;
    queueRenderPage(pageNum);
}
document.getElementById('next').addEventListener('click', onNextPage);
