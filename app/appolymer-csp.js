

(function(scope) {

/**
  `Polymer.CoreResizable` and `Polymer.CoreResizer` are a set of mixins that can be used
  in Polymer elements to coordinate the flow of resize events between "resizers" (elements
  that control the size or hidden state of their children) and "resizables" (elements that
  need to be notified when they are resized or un-hidden by their parents in order to take
  action on their new measurements).

  Elements that perform measurement should add the `Core.Resizable` mixin to their 
  Polymer prototype definition and listen for the `core-resize` event on themselves.
  This event will be fired when they become showing after having been hidden,
  when they are resized explicitly by a `CoreResizer`, or when the window has been resized.
  Note, the `core-resize` event is non-bubbling.

  `CoreResizable`'s must manually call the `resizableAttachedHandler` from the element's
  `attached` callback and `resizableDetachedHandler` from the element's `detached`
  callback.

    @element CoreResizable
    @status beta
    @homepage github.io
*/

  scope.CoreResizable = {

    /**
     * User must call from `attached` callback
     *
     * @method resizableAttachedHandler
     */
    resizableAttachedHandler: function(cb) {
      cb = cb || this._notifyResizeSelf;
      this.async(function() {
        var detail = {callback: cb, hasParentResizer: false};
        this.fire('core-request-resize', detail);
        if (!detail.hasParentResizer) {
          this._boundWindowResizeHandler = cb.bind(this);
          // log('adding window resize handler', null, this);
          window.addEventListener('resize', this._boundWindowResizeHandler);
        }
      }.bind(this));
    },

    /**
     * User must call from `detached` callback
     *
     * @method resizableDetachedHandler
     */
    resizableDetachedHandler: function() {
      this.fire('core-request-resize-cancel', null, this, false);
      if (this._boundWindowResizeHandler) {
        window.removeEventListener('resize', this._boundWindowResizeHandler);
      }
    },

    // Private: fire non-bubbling resize event to self; returns whether
    // preventDefault was called, indicating that children should not
    // be resized
    _notifyResizeSelf: function() {
      return this.fire('core-resize', null, this, false).defaultPrevented;
    }

  };

/**
  `Polymer.CoreResizable` and `Polymer.CoreResizer` are a set of mixins that can be used
  in Polymer elements to coordinate the flow of resize events between "resizers" (elements
  that control the size or hidden state of their children) and "resizables" (elements that
  need to be notified when they are resized or un-hidden by their parents in order to take
  action on their new measurements).

  Elements that cause their children to be resized (e.g. a splitter control) or hide/show
  their children (e.g. overlay) should add the `Core.CoreResizer` mixin to their 
  Polymer prototype definition and then call `this.notifyResize()` any time the element
  resizes or un-hides its children.

  `CoreResizer`'s must manually call the `resizerAttachedHandler` from the element's
  `attached` callback and `resizerDetachedHandler` from the element's `detached`
  callback.

  Note: `CoreResizer` extends `CoreResizable`, and can listen for the `core-resize` event
  on itself if it needs to perform resize work on itself before notifying children.
  In this case, returning `false` from the `core-resize` event handler (or calling
  `preventDefault` on the event) will prevent notification of children if required.

  @element CoreResizer
  @extends CoreResizable
  @status beta
  @homepage github.io
*/

  scope.CoreResizer = Polymer.mixin({

    /**
     * User must call from `attached` callback
     *
     * @method resizerAttachedHandler
     */
    resizerAttachedHandler: function() {
      this.resizableAttachedHandler(this.notifyResize);
      this._boundResizeRequested = this._boundResizeRequested || this._handleResizeRequested.bind(this);
      var listener;
      if (this.resizerIsPeer) {
        listener = this.parentElement || (this.parentNode && this.parentNode.host);
        listener._resizerPeers = listener._resizerPeers || [];
        listener._resizerPeers.push(this);
      } else {
        listener = this;
      }
      listener.addEventListener('core-request-resize', this._boundResizeRequested);
      this._resizerListener = listener;
    },

    /**
     * User must call from `detached` callback
     *
     * @method resizerDetachedHandler
     */
    resizerDetachedHandler: function() {
      this.resizableDetachedHandler();
      this._resizerListener.removeEventListener('core-request-resize', this._boundResizeRequested);
    },

    /**
     * User should call when resizing or un-hiding children
     *
     * @method notifyResize
     */
    notifyResize: function() {
      // Notify self
      if (!this._notifyResizeSelf()) {
        // Notify requestors if default was not prevented
        var r = this.resizeRequestors;
        if (r) {
          for (var i=0; i<r.length; i++) {
            var ri = r[i];
            if (!this.resizerShouldNotify || this.resizerShouldNotify(ri.target)) {
              // log('notifying resize', null, ri.target, true);
              ri.callback.apply(ri.target);
              // logEnd();
            }
          }
        }
      }
    },

    /**
     * User should implement to introduce filtering when notifying children.
     * Generally, children that are hidden by the CoreResizer (e.g. non-active
     * pages) need not be notified during resize, since they will be notified
     * again when becoming un-hidden.
     *
     * Return `true` if CoreResizable passed as argument should be notified of
     * resize.
     *
     * @method resizeerShouldNotify
     * @param {Element} el
     */
     // resizeerShouldNotify: function(el) { }  // User to implement if needed

    /**
     * Set to `true` if the resizer is actually a peer to the elements it
     * resizes (e.g. splitter); in this case it will listen for resize requests
     * events from its peers on its parent.
     *
     * @property resizerIsPeer
     * @type Boolean
     * @default false
     */

    // Private: Handle requests for resize
    _handleResizeRequested: function(e) {
      var target = e.path[0];
      if ((target == this) || 
          (target == this._resizerListener) || 
          (this._resizerPeers && this._resizerPeers.indexOf(target) < 0)) {
        return;
      }
      // log('resize requested', target, this);
      if (!this.resizeRequestors) {
        this.resizeRequestors = [];
      }
      this.resizeRequestors.push({target: target, callback: e.detail.callback});
      target.addEventListener('core-request-resize-cancel', this._cancelResizeRequested.bind(this));
      e.detail.hasParentResizer = true;
      e.stopPropagation();
    },

    // Private: Handle cancellation requests for resize
    _cancelResizeRequested: function(e) {
      // Exit early if we're already out of the DOM (resizeRequestors will already be null)
      if (this.resizeRequestors) {
        for (var i=0; i<this.resizeRequestors.length; i++) {
          if (this.resizeRequestors[i].target == e.target) {
            // log('resizeCanceled', e.target, this);
            this.resizeRequestors.splice(i, 1);
            break;
          }
        }
      }
    }

  }, Polymer.CoreResizable);

  // function prettyName(el) {
  //   return el.localName + (el.id ? '#' : '') + el.id;
  // }

  // function log(what, from, to, group) {
  //   var args = [what];
  //   if (from) {
  //     args.push('from ' + prettyName(from));
  //   }
  //   if (to) {
  //     args.push('to ' + prettyName(to));
  //   }
  //   if (group) {
  //     console.group.apply(console, args);
  //   } else {
  //     console.log.apply(console, args);
  //   }
  // }

  // function logEnd() {
  //   console.groupEnd();
  // }

})(Polymer);

;


  Polymer('core-header-panel',{

    /**
     * Fired when the content has been scrolled.  `event.detail.target` returns
     * the scrollable element which you can use to access scroll info such as
     * `scrollTop`.
     *
     *     <core-header-panel on-scroll="{{scrollHandler}}">
     *       ...
     *     </core-header-panel>
     *
     *
     *     scrollHandler: function(event) {
     *       var scroller = event.detail.target;
     *       console.log(scroller.scrollTop);
     *     }
     *
     * @event scroll
     */

    publish: {
      /**
       * Controls header and scrolling behavior. Options are
       * `standard`, `seamed`, `waterfall`, `waterfall-tall`, `scroll` and 
       * `cover`. Default is `standard`.
       *
       * `standard`: The header is a step above the panel. The header will consume the
       * panel at the point of entry, preventing it from passing through to the
       * opposite side.
       *
       * `seamed`: The header is presented as seamed with the panel.
       *
       * `waterfall`: Similar to standard mode, but header is initially presented as
       * seamed with panel, but then separates to form the step.
       *
       * `waterfall-tall`: The header is initially taller (`tall` class is added to
       * the header).  As the user scrolls, the header separates (forming an edge)
       * while condensing (`tall` class is removed from the header).
       *
       * `scroll`: The header keeps its seam with the panel, and is pushed off screen.
       *
       * `cover`: The panel covers the whole `core-header-panel` including the
       * header. This allows user to style the panel in such a way that the panel is
       * partially covering the header.
       *
       *     <style>
       *       core-header-panel[mode=cover]::shadow #mainContainer {
       *         left: 80px;
       *       }
       *       .content {
       *         margin: 60px 60px 60px 0;
       *       }
       *     </style>
       *
       *     <core-header-panel mode="cover">
       *       <core-toolbar class="tall">
       *         <core-icon-button icon="menu"></core-icon-button>
       *       </core-toolbar>
       *       <div class="content"></div>
       *     </core-header-panel>
       *
       * @attribute mode
       * @type string
       * @default ''
       */
      mode: {value: '', reflect: true},

      /**
       * The class used in waterfall-tall mode.  Change this if the header
       * accepts a different class for toggling height, e.g. "medium-tall"
       *
       * @attribute tallClass
       * @type string
       * @default 'tall'
       */
      tallClass: 'tall',

      /**
       * If true, the drop-shadow is always shown no matter what mode is set to.
       *
       * @attribute shadow
       * @type boolean
       * @default false
       */
      shadow: false
    },

    animateDuration: 200,

    modeConfigs: {
      shadowMode: {'waterfall': 1, 'waterfall-tall': 1},
      noShadow: {'seamed': 1, 'cover': 1, 'scroll': 1},
      tallMode: {'waterfall-tall': 1},
      outerScroll: {'scroll': 1}
    },
    
    ready: function() {
      this.scrollHandler = this.scroll.bind(this);
      this.addListener();
    },
    
    detached: function() {
      this.removeListener(this.mode);
    },
    
    addListener: function() {
      this.scroller.addEventListener('scroll', this.scrollHandler);
    },
    
    removeListener: function(mode) {
      var s = this.getScrollerForMode(mode);
      s.removeEventListener('scroll', this.scrollHandler);
    },

    domReady: function() {
      this.async('scroll');
    },

    modeChanged: function(old) {
      var configs = this.modeConfigs;
      var header = this.header;
      if (header) {
        // in tallMode it may add tallClass to the header; so do the cleanup
        // when mode is changed from tallMode to not tallMode
        if (configs.tallMode[old] && !configs.tallMode[this.mode]) {
          header.classList.remove(this.tallClass);
          this.async(function() {
            header.classList.remove('animate');
          }, null, this.animateDuration);
        } else {
          header.classList.toggle('animate', configs.tallMode[this.mode]);
        }
      }
      if (configs && (configs.outerScroll[this.mode] || configs.outerScroll[old])) {
        this.removeListener(old);
        this.addListener();
      }
      this.scroll();
    },

    get header() {
      return this.$.headerContent.getDistributedNodes()[0];
    },
    
    getScrollerForMode: function(mode) {
      return this.modeConfigs.outerScroll[mode] ?
          this.$.outerContainer : this.$.mainContainer;
    },

    /**
     * Returns the scrollable element.
     *
     * @property scroller
     * @type Object
     */
    get scroller() {
      return this.getScrollerForMode(this.mode);
    },

    scroll: function() {
      var configs = this.modeConfigs;
      var main = this.$.mainContainer;
      var header = this.header;

      var sTop = main.scrollTop;
      var atTop = sTop === 0;

      this.$.dropShadow.classList.toggle('hidden', !this.shadow &&
          (atTop && configs.shadowMode[this.mode] || configs.noShadow[this.mode]));

      if (header && configs.tallMode[this.mode]) {
        header.classList.toggle(this.tallClass, atTop ||
            header.classList.contains(this.tallClass) &&
            main.scrollHeight < this.$.outerContainer.offsetHeight);
      }

      this.fire('scroll', {target: this.scroller}, this, false);
    }

  });

;


(function() {

  Polymer('core-toolbar', {
    
    /**
     * Controls how the items are aligned horizontally.
     * Options are `start`, `center`, `end`, `between` and `around`.
     *
     * @attribute justify
     * @type string
     * @default ''
     */
    justify: '',
    
    /**
     * Controls how the items are aligned horizontally when they are placed
     * in the middle.
     * Options are `start`, `center`, `end`, `between` and `around`.
     *
     * @attribute middleJustify
     * @type string
     * @default ''
     */
    middleJustify: '',
    
    /**
     * Controls how the items are aligned horizontally when they are placed
     * at the bottom.
     * Options are `start`, `center`, `end`, `between` and `around`.
     *
     * @attribute bottomJustify
     * @type string
     * @default ''
     */
    bottomJustify: '',
    
    justifyChanged: function(old) {
      this.updateBarJustify(this.$.topBar, this.justify, old);
    },
    
    middleJustifyChanged: function(old) {
      this.updateBarJustify(this.$.middleBar, this.middleJustify, old);
    },
    
    bottomJustifyChanged: function(old) {
      this.updateBarJustify(this.$.bottomBar, this.bottomJustify, old);
    },
    
    updateBarJustify: function(bar, justify, old) {
      if (old) {
        bar.removeAttribute(this.toLayoutAttrName(old));
      }
      if (justify) {
        bar.setAttribute(this.toLayoutAttrName(justify), '');
      }
    },
    
    toLayoutAttrName: function(value) {
      return value === 'between' ? 'justified' : value + '-justified';
    }
    
  });

})();

;


  (function() {
    
    var SKIP_ID = 'meta';
    var metaData = {}, metaArray = {};

    Polymer('core-meta', {
      
      /**
       * The type of meta-data.  All meta-data with the same type with be
       * stored together.
       * 
       * @attribute type
       * @type string
       * @default 'default'
       */
      type: 'default',
      
      alwaysPrepare: true,
      
      ready: function() {
        this.register(this.id);
      },
      
      get metaArray() {
        var t = this.type;
        if (!metaArray[t]) {
          metaArray[t] = [];
        }
        return metaArray[t];
      },
      
      get metaData() {
        var t = this.type;
        if (!metaData[t]) {
          metaData[t] = {};
        }
        return metaData[t];
      },
      
      register: function(id, old) {
        if (id && id !== SKIP_ID) {
          this.unregister(this, old);
          this.metaData[id] = this;
          this.metaArray.push(this);
        }
      },
      
      unregister: function(meta, id) {
        delete this.metaData[id || meta.id];
        var i = this.metaArray.indexOf(meta);
        if (i >= 0) {
          this.metaArray.splice(i, 1);
        }
      },
      
      /**
       * Returns a list of all meta-data elements with the same type.
       * 
       * @property list
       * @type array
       * @default []
       */
      get list() {
        return this.metaArray;
      },
      
      /**
       * Retrieves meta-data by ID.
       *
       * @method byId
       * @param {String} id The ID of the meta-data to be returned.
       * @returns Returns meta-data.
       */
      byId: function(id) {
        return this.metaData[id];
      }
      
    });
    
  })();
  
;

  
    Polymer('core-iconset', {
  
      /**
       * The URL of the iconset image.
       *
       * @attribute src
       * @type string
       * @default ''
       */
      src: '',

      /**
       * The width of the iconset image. This must only be specified if the
       * icons are arranged into separate rows inside the image.
       *
       * @attribute width
       * @type number
       * @default 0
       */
      width: 0,

      /**
       * A space separated list of names corresponding to icons in the iconset
       * image file. This list must be ordered the same as the icon images
       * in the image file.
       *
       * @attribute icons
       * @type string
       * @default ''
       */
      icons: '',

      /**
       * The size of an individual icon. Note that icons must be square.
       *
       * @attribute iconSize
       * @type number
       * @default 24
       */
      iconSize: 24,

      /**
       * The horizontal offset of the icon images in the inconset src image.
       * This is typically used if the image resource contains additional images
       * beside those intended for the iconset.
       *
       * @attribute offsetX
       * @type number
       * @default 0
       */
      offsetX: 0,
      /**
       * The vertical offset of the icon images in the inconset src image.
       * This is typically used if the image resource contains additional images
       * beside those intended for the iconset.
       *
       * @attribute offsetY
       * @type number
       * @default 0
       */
      offsetY: 0,
      type: 'iconset',

      created: function() {
        this.iconMap = {};
        this.iconNames = [];
        this.themes = {};
      },
  
      ready: function() {
        // TODO(sorvell): ensure iconset's src is always relative to the main
        // document
        if (this.src && (this.ownerDocument !== document)) {
          this.src = this.resolvePath(this.src, this.ownerDocument.baseURI);
        }
        this.super();
        this.updateThemes();
      },

      iconsChanged: function() {
        var ox = this.offsetX;
        var oy = this.offsetY;
        this.icons && this.icons.split(/\s+/g).forEach(function(name, i) {
          this.iconNames.push(name);
          this.iconMap[name] = {
            offsetX: ox,
            offsetY: oy
          }
          if (ox + this.iconSize < this.width) {
            ox += this.iconSize;
          } else {
            ox = this.offsetX;
            oy += this.iconSize;
          }
        }, this);
      },

      updateThemes: function() {
        var ts = this.querySelectorAll('property[theme]');
        ts && ts.array().forEach(function(t) {
          this.themes[t.getAttribute('theme')] = {
            offsetX: parseInt(t.getAttribute('offsetX')) || 0,
            offsetY: parseInt(t.getAttribute('offsetY')) || 0
          };
        }, this);
      },

      // TODO(ffu): support retrived by index e.g. getOffset(10);
      /**
       * Returns an object containing `offsetX` and `offsetY` properties which
       * specify the pixel locaion in the iconset's src file for the given
       * `icon` and `theme`. It's uncommon to call this method. It is useful,
       * for example, to manually position a css backgroundImage to the proper
       * offset. It's more common to use the `applyIcon` method.
       *
       * @method getOffset
       * @param {String|Number} icon The name of the icon or the index of the
       * icon within in the icon image.
       * @param {String} theme The name of the theme.
       * @returns {Object} An object specifying the offset of the given icon 
       * within the icon resource file; `offsetX` is the horizontal offset and
       * `offsetY` is the vertical offset. Both values are in pixel units.
       */
      getOffset: function(icon, theme) {
        var i = this.iconMap[icon];
        if (!i) {
          var n = this.iconNames[Number(icon)];
          i = this.iconMap[n];
        }
        var t = this.themes[theme];
        if (i && t) {
          return {
            offsetX: i.offsetX + t.offsetX,
            offsetY: i.offsetY + t.offsetY
          }
        }
        return i;
      },

      /**
       * Applies an icon to the given element as a css background image. This
       * method does not size the element, and it's often necessary to set 
       * the element's height and width so that the background image is visible.
       *
       * @method applyIcon
       * @param {Element} element The element to which the background is
       * applied.
       * @param {String|Number} icon The name or index of the icon to apply.
       * @param {Number} scale (optional, defaults to 1) A scaling factor 
       * with which the icon can be magnified.
       * @return {Element} The icon element.
       */
      applyIcon: function(element, icon, scale) {
        var offset = this.getOffset(icon);
        scale = scale || 1;
        if (element && offset) {
          var icon = element._icon || document.createElement('div');
          var style = icon.style;
          style.backgroundImage = 'url(' + this.src + ')';
          style.backgroundPosition = (-offset.offsetX * scale + 'px') + 
             ' ' + (-offset.offsetY * scale + 'px');
          style.backgroundSize = scale === 1 ? 'auto' :
             this.width * scale + 'px';
          if (icon.parentNode !== element) {
            element.appendChild(icon);
          }
          return icon;
        }
      }

    });

  ;

(function() {
  
  // mono-state
  var meta;
  
  Polymer('core-icon', {

    /**
     * The URL of an image for the icon. If the src property is specified,
     * the icon property should not be.
     *
     * @attribute src
     * @type string
     * @default ''
     */
    src: '',

    /**
     * Specifies the icon name or index in the set of icons available in
     * the icon's icon set. If the icon property is specified,
     * the src property should not be.
     *
     * @attribute icon
     * @type string
     * @default ''
     */
    icon: '',

    /**
     * Alternative text content for accessibility support.
     * If alt is present and not empty, it will set the element's role to img and add an aria-label whose content matches alt.
     * If alt is present and is an empty string, '', it will hide the element from the accessibility layer
     * If alt is not present, it will set the element's role to img and the element will fallback to using the icon attribute for its aria-label.
     * 
     * @attribute alt
     * @type string
     * @default ''
     */
    alt: null,

    observe: {
      'icon': 'updateIcon',
      'alt': 'updateAlt'
    },

    defaultIconset: 'icons',

    ready: function() {
      if (!meta) {
        meta = document.createElement('core-iconset');
      }

      // Allow user-provided `aria-label` in preference to any other text alternative.
      if (this.hasAttribute('aria-label')) {
        // Set `role` if it has not been overridden.
        if (!this.hasAttribute('role')) {
          this.setAttribute('role', 'img');
        }
        return;
      }
      this.updateAlt();
    },

    srcChanged: function() {
      var icon = this._icon || document.createElement('div');
      icon.textContent = '';
      icon.setAttribute('fit', '');
      icon.style.backgroundImage = 'url(' + this.src + ')';
      icon.style.backgroundPosition = 'center';
      icon.style.backgroundSize = '100%';
      if (!icon.parentNode) {
        this.appendChild(icon);
      }
      this._icon = icon;
    },

    getIconset: function(name) {
      return meta.byId(name || this.defaultIconset);
    },

    updateIcon: function(oldVal, newVal) {
      if (!this.icon) {
        this.updateAlt();
        return;
      }
      var parts = String(this.icon).split(':');
      var icon = parts.pop();
      if (icon) {
        var set = this.getIconset(parts.pop());
        if (set) {
          this._icon = set.applyIcon(this, icon);
          if (this._icon) {
            this._icon.setAttribute('fit', '');
          }
        }
      }
      // Check to see if we're using the old icon's name for our a11y fallback
      if (oldVal) {
        if (oldVal.split(':').pop() == this.getAttribute('aria-label')) {
          this.updateAlt();
        }
      }
    },

    updateAlt: function() {
      // Respect the user's decision to remove this element from
      // the a11y tree
      if (this.getAttribute('aria-hidden')) {
        return;
      }

      // Remove element from a11y tree if `alt` is empty, otherwise
      // use `alt` as `aria-label`.
      if (this.alt === '') {
        this.setAttribute('aria-hidden', 'true');
        if (this.hasAttribute('role')) {
          this.removeAttribute('role');
        }
        if (this.hasAttribute('aria-label')) {
          this.removeAttribute('aria-label');
        }
      } else {
        this.setAttribute('aria-label', this.alt ||
                                        this.icon.split(':').pop());
        if (!this.hasAttribute('role')) {
          this.setAttribute('role', 'img');
        }
        if (this.hasAttribute('aria-hidden')) {
          this.removeAttribute('aria-hidden');
        }
      }
    }

  });
  
})();
;

    Polymer('core-selection', {
      /**
       * If true, multiple selections are allowed.
       *
       * @attribute multi
       * @type boolean
       * @default false
       */
      multi: false,
      ready: function() {
        this.clear();
      },
      clear: function() {
        this.selection = [];
      },
      /**
       * Retrieves the selected item(s).
       * @method getSelection
       * @returns Returns the selected item(s). If the multi property is true,
       * getSelection will return an array, otherwise it will return 
       * the selected item or undefined if there is no selection.
      */
      getSelection: function() {
        return this.multi ? this.selection : this.selection[0];
      },
      /**
       * Indicates if a given item is selected.
       * @method isSelected
       * @param {any} item The item whose selection state should be checked.
       * @returns Returns true if `item` is selected.
      */
      isSelected: function(item) {
        return this.selection.indexOf(item) >= 0;
      },
      setItemSelected: function(item, isSelected) {
        if (item !== undefined && item !== null) {
          if (isSelected) {
            this.selection.push(item);
          } else {
            var i = this.selection.indexOf(item);
            if (i >= 0) {
              this.selection.splice(i, 1);
            }
          }
          this.fire("core-select", {isSelected: isSelected, item: item});
        }
      },
      /**
       * Set the selection state for a given `item`. If the multi property
       * is true, then the selected state of `item` will be toggled; otherwise
       * the `item` will be selected.
       * @method select
       * @param {any} item: The item to select.
      */
      select: function(item) {
        if (this.multi) {
          this.toggle(item);
        } else if (this.getSelection() !== item) {
          this.setItemSelected(this.getSelection(), false);
          this.setItemSelected(item, true);
        }
      },
      /**
       * Toggles the selection state for `item`.
       * @method toggle
       * @param {any} item: The item to toggle.
      */
      toggle: function(item) {
        this.setItemSelected(item, !this.isSelected(item));
      }
    });
  ;

(function() {

  var IOS = navigator.userAgent.match(/iP(?:hone|ad;(?: U;)? CPU) OS (\d+)/);
  var IOS_TOUCH_SCROLLING = IOS && IOS[1] >= 8;

  Polymer('core-list',Polymer.mixin({
    
    publish: {
      /**
       * Fired when an item element is tapped.
       * 
       * @event core-activate
       * @param {Object} detail
       *   @param {Object} detail.item the item element
       */

      /**
       * An array of source data for the list to display.  Elements
       * from this array will be set to the `model` peroperty on each
       * template instance scope for binding.
       *
       * When `groups` is used, this array may either be flat, with
       * the group lengths specified in the `groups` array; otherwise
       * `data` may be specified as an array of arrays, such that the
       * each array in `data` specifies a group.  See examples above.
       *
       * @attribute data
       * @type array
       * @default null
       */
      data: null,

      /**
       * An array of data conveying information about groupings of items
       * in the `data` array.  Elements from this array will be set to the
       * `groupModel` property of each template instance scope for binding.
       *
       * When `groups` is used, template children with the `divider` attribute
       * will be shown above each group.  Typically data from the `groupModel`
       * would be bound to dividers.
       *
       * If `data` is specified as a flat array, the `groups` array must
       * contain objects of the format `{ length: n, data: {...} }`, where
       * `length` determines the number of items from the `data` array
       * that should be grouped, and `data` specifies the user data that will
       * be assigned to the `groupModel` property on the template instance
       * scope.
       *
       * If `data` is specified as a nested array of arrays, group lengths
       * are derived from these arrays, so each object in `groups` need only
       * contain the user data to be assigned to `groupModel`.
       *
       * @attribute groups
       * @type array
       * @default null
       */
      groups: null,

      /**
       * 
       * An optional element on which to listen for scroll events.
       *
       * @attribute scrollTarget
       * @type Element
       * @default core-list
       */
      scrollTarget: null,

      /**
       * 
       * When true, tapping a row will select the item, placing its data model
       * in the set of selected items retrievable via the `selection` property.
       *
       * Note that tapping focusable elements within the list item will not
       * result in selection, since they are presumed to have their own action.
       *
       * @attribute selectionEnabled
       * @type {boolean}
       * @default true
       */
      selectionEnabled: true,

      /**
       * 
       * Set to true to support multiple selection.  Note, existing selection
       * state is maintained only when changing `multi` from `false` to `true`;
       * it is cleared when changing from `true` to `false`.
       *
       * @attribute multi
       * @type boolean
       * @default false
       */
      multi: false,

      /**
       * 
       * Data record (or array of records, if `multi: true`) corresponding to
       * the currently selected set of items.
       *
       * @attribute selection
       * @type {any}
       * @default null
       */
       selection: null,

      /**
       * 
       * When true, the list is rendered as a grid.  Grid items must be fixed
       * height and width, with the width of each item specified in the `width`
       * property.
       *
       * @attribute grid
       * @type boolean
       * @default false
       */
       grid: false,

      /**
       * 
       * When `grid` is used, `width` determines the width of each grid item.
       * This property has no meaning when not in `grid` mode.
       *
       * @attribute width
       * @type number
       * @default null
       */
       width: null,

      /**
       * The approximate height of a list item, in pixels. This is used only for determining
       * the number of physical elements to render based on the viewport size
       * of the list.  Items themselves may vary in height between each other
       * depending on their data model.  There is typically no need to adjust 
       * this value unless the average size is much larger or smaller than the default.
       *
       * @attribute height
       * @type number
       * @default 200
       */
      height: 200,

      /**
       * The amount of scrolling runway the list keeps rendered, as a factor of
       * the list viewport size.  There is typically no need to adjust this value
       * other than for performance tuning.  Larger value correspond to more
       * physical elements being rendered.
       *
       * @attribute runwayFactor
       * @type number
       * @default 4
       */
      runwayFactor: 4

    },

    eventDelegates: {
      tap: 'tapHandler',
      'core-resize': 'updateSize'
    },

    // Local cache of scrollTop
    _scrollTop: 0,
    
    observe: {
      'isAttached data grid width template scrollTarget': 'initialize',
      'multi selectionEnabled': '_resetSelection'
    },

    ready: function() {
      this._boundScrollHandler = this.scrollHandler.bind(this);
      this._boundPositionItems = this._positionItems.bind(this);
      this._oldMulti = this.multi;
      this._oldSelectionEnabled = this.selectionEnabled;
      this._virtualStart = 0;
      this._virtualCount = 0;
      this._physicalStart = 0;
      this._physicalOffset = 0;
      this._physicalSize = 0;
      this._physicalSizes = [];
      this._physicalAverage = 0;
      this._itemSizes = [];
      this._dividerSizes = [];
      this._repositionedItems = [];

      this._aboveSize = 0;

      this._nestedGroups = false;
      this._groupStart = 0;
      this._groupStartIndex = 0;
    },

    attached: function() {
      this.isAttached = true;
      this.template = this.querySelector('template');
      if (!this.template.bindingDelegate) {
        this.template.bindingDelegate = this.element.syntax;
      }
      this.resizableAttachedHandler();
    },

    detached: function() {
      this.isAttached = false;
      if (this._target) {
        this._target.removeEventListener('scroll', this._boundScrollHandler);
      }
      this.resizableDetachedHandler();
    },

    /**
     * To be called by the user when the list is manually resized
     * or shown after being hidden.
     *
     * @method updateSize
     */
    updateSize: function() {
      if (!this._positionPending && !this._needItemInit) {
        this._resetIndex(this._getFirstVisibleIndex() || 0);
        this.initialize();
      }
    },

    _resetSelection: function() {
      if (((this._oldMulti != this.multi) && !this.multi) || 
          ((this._oldSelectionEnabled != this.selectionEnabled) && 
            !this.selectionEnabled)) {
        this._clearSelection();
        this.refresh();
      } else {
        this.selection = this.$.selection.getSelection();
      }
      this._oldMulti = this.multi;
      this._oldSelectionEnabled = this.selectionEnabled;
    },

    // Adjust virtual start index based on changes to backing data
    _adjustVirtualIndex: function(splices, group) {
      if (this._targetSize === 0) {
        return;
      }
      var totalDelta = 0;
      for (var i=0; i<splices.length; i++) {
        var s = splices[i];
        var idx = s.index;
        var gidx, gitem;
        if (group) {
          gidx = this.data.indexOf(group);
          idx += this.virtualIndexForGroup(gidx);
        }
        // We only need to care about changes happening above the current position
        if (idx >= this._virtualStart) {
          break;
        }
        var delta = Math.max(s.addedCount - s.removed.length, idx - this._virtualStart);
        totalDelta += delta;
        this._physicalStart += delta;
        this._virtualStart += delta;
        if (this._grouped) {
          if (group) {
            gitem = s.index;
          } else {
            var g = this.groupForVirtualIndex(s.index);
            gidx = g.group;
            gitem = g.groupIndex;
          }
          if (gidx == this._groupStart && gitem < this._groupStartIndex) {
            this._groupStartIndex += delta;
          }
        }
      }
      // Adjust offset/scroll position based on total number of items changed
      if (this._virtualStart < this._physicalCount) {
        this._resetIndex(this._getFirstVisibleIndex() || 0);
      } else {
        totalDelta = Math.max((totalDelta / this._rowFactor) * this._physicalAverage, -this._physicalOffset);
        this._physicalOffset += totalDelta;
        this._scrollTop = this.setScrollTop(this._scrollTop + totalDelta);
      }
    },

    _updateSelection: function(splices) {
      for (var i=0; i<splices.length; i++) {
        var s = splices[i];
        for (var j=0; j<s.removed.length; j++) {
          var d = s.removed[j];
          this.$.selection.setItemSelected(d, false);
        }
      }
    },

    groupsChanged: function() {
      if (!!this.groups != this._grouped) {
        this.updateSize();
      }
    },

    initialize: function() {
      if (!this.template || !this.isAttached) {
        return;
      }

      // TODO(kschaaf): Checking arguments.length currently the only way to 
      // know that the array was mutated as opposed to newly assigned; need
      // a better API for Polymer observers
      var splices;
      if (arguments.length == 1) {
        splices = arguments[0];
        if (!this._nestedGroups) {
          this._adjustVirtualIndex(splices);
        }
        this._updateSelection(splices);
      } else {
        this._clearSelection();
      }

      // Initialize scroll target
      var target = this.scrollTarget || this;
      if (this._target !== target) {
        this.initializeScrollTarget(target);
      }

      // Initialize data
      this.initializeData(splices, false);
    },

    initializeScrollTarget: function(target) {
      // Listen for scroll events
      if (this._target) {
        this._target.removeEventListener('scroll', this._boundScrollHandler, false);
      }
      this._target = target;
      target.addEventListener('scroll', this._boundScrollHandler, false);
      // Support for non-native scrollers (must implement abstract API):
      // getScrollTop, setScrollTop, sync
      if ((target != this) && target.setScrollTop && target.getScrollTop) {
        this.setScrollTop = function(val) {
          target.setScrollTop(val);
          return target.getScrollTop();
        };
        this.getScrollTop = target.getScrollTop.bind(target);
        this.syncScroller = target.sync ? target.sync.bind(target) : function() {};
        // Adjusting scroll position on non-native scrollers is risky
        this.adjustPositionAllowed = false;
      } else {
        this.setScrollTop = function(val) {
          target.scrollTop = val;
          return target.scrollTop;
        };
        this.getScrollTop = function() {
          return target.scrollTop;
        };
        this.syncScroller = function() {};
        this.adjustPositionAllowed = true;
      }
      // Only use -webkit-overflow-touch from iOS8+, where scroll events are fired
      if (IOS_TOUCH_SCROLLING) {
        target.style.webkitOverflowScrolling = 'touch';
        // Adjusting scrollTop during iOS momentum scrolling is "no bueno"
        this.adjustPositionAllowed = false;
      }
      // Force overflow as necessary
      this._target.style.willChange = 'transform';
      if (getComputedStyle(this._target).position == 'static') {
        this._target.style.position = 'relative';
      }
      this.style.overflowY = (target == this) ? 'auto' : null;
    },

    updateGroupObservers: function(splices) {
      // If we're going from grouped to non-grouped, remove all observers
      if (!this._nestedGroups) {
        if (this._groupObservers && this._groupObservers.length) {
          splices = [{
            index: 0,
            addedCount: 0,
            removed: this._groupObservers
          }];
        } else {
          splices = null;
        }
      }
      // Otherwise, create observers for all groups, unless this is a group splice
      if (this._nestedGroups) {
        splices = splices || [{
          index: 0,
          addedCount: this.data.length,
          removed: []
        }];
      }
      if (splices) {
        var observers = this._groupObservers || [];
        // Apply the splices to the observer array
        for (var i=0; i<splices.length; i++) {
          var s = splices[i], j;
          var args = [s.index, s.removed.length];
          if (s.removed.length) {
            for (j=s.index; j<s.removed.length; j++) {
              observers[j].close();
            }
          }
          if (s.addedCount) {
            for (j=s.index; j<s.addedCount; j++) {
              var o = new ArrayObserver(this.data[j]);
              args.push(o);
              o.open(this.getGroupDataHandler(this.data[j]));
            }
          }
          observers.splice.apply(observers, args);
        }
        this._groupObservers = observers;
      }
    },

    getGroupDataHandler: function(group) {
      return function(splices) {
        this.groupDataChanged(splices, group);
      }.bind(this);
    },

    groupDataChanged: function(splices, group) {
      this._adjustVirtualIndex(splices, group);
      this._updateSelection(splices);
      this.initializeData(null, true);
    },

    initializeData: function(splices, groupUpdate) {
      var i;

      // Calculate row-factor for grid layout
      if (this.grid) {
        if (!this.width) {
          throw 'Grid requires the `width` property to be set';
        }
        this._rowFactor = Math.floor(this._target.offsetWidth / this.width) || 1;
        var cs = getComputedStyle(this._target);
        var padding = parseInt(cs.paddingLeft || 0) + parseInt(cs.paddingRight || 0);
        this._rowMargin = (this._target.offsetWidth - (this._rowFactor * this.width) - padding) / 2;
      } else {
        this._rowFactor = 1;
        this._rowMargin = 0;
      }

      // Count virtual data size, depending on whether grouping is enabled
      if (!this.data || !this.data.length) {
        this._virtualCount = 0;
        this._grouped = false;
        this._nestedGroups = false;
      } else if (this.groups) {
        this._grouped = true;
        this._nestedGroups = Array.isArray(this.data[0]);
        if (this._nestedGroups) {
          if (this.groups.length != this.data.length) {
            throw 'When using nested grouped data, data.length and groups.length must agree!';
          }
          this._virtualCount = 0;
          for (i=0; i<this.groups.length; i++) {
            this._virtualCount += this.data[i] && this.data[i].length;
          }
        } else {
          this._virtualCount = this.data.length;
          var len = 0;
          for (i=0; i<this.groups.length; i++) {
            len += this.groups[i].length;
          }
          if (len != this.data.length) {
            throw 'When using groups data, the sum of group[n].length\'s and data.length must agree!';
          }
        }
        var g = this.groupForVirtualIndex(this._virtualStart);
        this._groupStart = g.group;
        this._groupStartIndex = g.groupIndex;
      } else {
        this._grouped = false;
        this._nestedGroups = false;
        this._virtualCount = this.data.length;
      }

      // Update grouped array observers used when group data is nested
      if (!groupUpdate) {
        this.updateGroupObservers(splices);
      }
      
      // Add physical items up to a max based on data length, viewport size, and extra item overhang
      var currentCount = this._physicalCount || 0;
      var height = this._target.offsetHeight;
      if (!height && this._target.offsetParent) {
        console.warn('core-list must either be sized or be inside an overflow:auto div that is sized');
      }
      this._physicalCount = Math.min(Math.ceil(height / (this._physicalAverage || this.height)) * this.runwayFactor * this._rowFactor, this._virtualCount);
      this._physicalCount = Math.max(currentCount, this._physicalCount);
      this._physicalData = this._physicalData || new Array(this._physicalCount);
      var needItemInit = false;
      while (currentCount < this._physicalCount) {
        var model = this.templateInstance ? Object.create(this.templateInstance.model) : {};
        this._physicalData[currentCount++] = model;
        needItemInit = true;
      }
      this.template.model = this._physicalData;
      this.template.setAttribute('repeat', '');
      this._dir = 0;

      // If we've added new items, wait until the template renders then
      // initialize the new items before refreshing
      if (!this._needItemInit) {
        if (needItemInit) {
          this._needItemInit = true;
          this.resetMetrics();
          this.onMutation(this, this.initializeItems);
        } else {
          this.refresh();
        }
      }
    },

    initializeItems: function() {
      var currentCount = this._physicalItems && this._physicalItems.length || 0;
      this._physicalItems = this._physicalItems || [new Array(this._physicalCount)];
      this._physicalDividers = this._physicalDividers || new Array(this._physicalCount);
      for (var i = 0, item = this.template.nextElementSibling;
           item && i < this._physicalCount;
           item = item.nextElementSibling) {
        if (item.getAttribute('divider') != null) {
          this._physicalDividers[i] = item;
        } else {
          this._physicalItems[i++] = item;
        }
      }
      this.refresh();
      this._needItemInit = false;
    },

    _updateItemData: function(force, physicalIndex, virtualIndex, groupIndex, groupItemIndex) {
      var physicalItem = this._physicalItems[physicalIndex];
      var physicalDatum = this._physicalData[physicalIndex];
      var virtualDatum = this.dataForIndex(virtualIndex, groupIndex, groupItemIndex);
      var needsReposition;
      if (force || physicalDatum.model != virtualDatum) {
        // Set model, index, and selected fields
        physicalDatum.model = virtualDatum;
        physicalDatum.index = virtualIndex;
        physicalDatum.physicalIndex = physicalIndex;
        physicalDatum.selected = this.selectionEnabled && virtualDatum ? 
            this._selectedData.get(virtualDatum) : null;
        // Set group-related fields
        if (this._grouped) {
          var groupModel = this.groups[groupIndex];
          physicalDatum.groupModel = groupModel && (this._nestedGroups ? groupModel : groupModel.data);
          physicalDatum.groupIndex = groupIndex;
          physicalDatum.groupItemIndex = groupItemIndex;
          physicalItem._isDivider = this.data.length && (groupItemIndex === 0);
          physicalItem._isRowStart = (groupItemIndex % this._rowFactor) === 0;
        } else {
          physicalDatum.groupModel = null;
          physicalDatum.groupIndex = null;
          physicalDatum.groupItemIndex = null;
          physicalItem._isDivider = false;
          physicalItem._isRowStart = (virtualIndex % this._rowFactor) === 0;
        }
        // Hide physical items when not in use (no model assigned)
        physicalItem.hidden = !virtualDatum;
        var divider = this._physicalDividers[physicalIndex];
        if (divider && (divider.hidden == physicalItem._isDivider)) {
          divider.hidden = !physicalItem._isDivider;
        }
        needsReposition = !force;
      } else {
        needsReposition = false;
      }
      return needsReposition || force;
    },

    scrollHandler: function() {
      if (IOS_TOUCH_SCROLLING) {
        // iOS sends multiple scroll events per rAF
        // Align work to rAF to reduce overhead & artifacts
        if (!this._raf) {
          this._raf = requestAnimationFrame(function() { 
            this._raf = null;
            this.refresh();
          }.bind(this));
        }
      } else {
        this.refresh();
      }
    },

    resetMetrics: function() {
      this._physicalAverage = 0;
      this._physicalAverageCount = 0;
    },

    updateMetrics: function(force) {
      // Measure physical items & dividers
      var totalSize = 0;
      var count = 0;
      for (var i=0; i<this._physicalCount; i++) {
        var item = this._physicalItems[i];
        if (!item.hidden) {
          var size = this._itemSizes[i] = item.offsetHeight;
          if (item._isDivider) {
            var divider = this._physicalDividers[i];
            if (divider) {
              size += (this._dividerSizes[i] = divider.offsetHeight);
            }
          }
          this._physicalSizes[i] = size;
          if (item._isRowStart) {
            totalSize += size;
            count++;
          }
        }
      }
      this._physicalSize = totalSize;

      // Measure other DOM
      this._viewportSize = this.$.viewport.offsetHeight;
      this._targetSize = this._target.offsetHeight;

      // Measure content in scroller before virtualized items
      if (this._target != this) {
        this._aboveSize = this.offsetTop;
      } else {
        this._aboveSize = parseInt(getComputedStyle(this._target).paddingTop);
      }

      // Calculate average height
      if (count) {
        totalSize = (this._physicalAverage * this._physicalAverageCount) + totalSize;
        this._physicalAverageCount += count;
        this._physicalAverage = Math.round(totalSize / this._physicalAverageCount);
      }
    },

    getGroupLen: function(group) {
      group = arguments.length ? group : this._groupStart;
      if (this._nestedGroups) {
        return this.data[group].length;
      } else {
        return this.groups[group].length;
      }
    },

    changeStartIndex: function(inc) {
      this._virtualStart += inc;
      if (this._grouped) {
        while (inc > 0) {
          var groupMax = this.getGroupLen() - this._groupStartIndex - 1;
          if (inc > groupMax) {
            inc -= (groupMax + 1);
            this._groupStart++;
            this._groupStartIndex = 0;
          } else {
            this._groupStartIndex += inc;
            inc = 0;
          }
        }
        while (inc < 0) {
          if (-inc > this._groupStartIndex) {
            inc += this._groupStartIndex;
            this._groupStart--;
            this._groupStartIndex = this.getGroupLen();
          } else {
            this._groupStartIndex += inc;
            inc = this.getGroupLen();
          }
        }
      }
      // In grid mode, virtualIndex must alway start on a row start!
      if (this.grid) {
        if (this._grouped) {
          inc = this._groupStartIndex % this._rowFactor;
        } else {
          inc = this._virtualStart % this._rowFactor;
        }
        if (inc) {
          this.changeStartIndex(-inc);
        }
      }
    },

    getRowCount: function(dir) {
      if (!this.grid) {
        return dir;
      } else if (!this._grouped) {
        return dir * this._rowFactor;
      } else {
        if (dir < 0) {
          if (this._groupStartIndex > 0) {
            return -Math.min(this._rowFactor, this._groupStartIndex);
          } else {
            var prevLen = this.getGroupLen(this._groupStart-1);
            return -Math.min(this._rowFactor, prevLen % this._rowFactor || this._rowFactor);
          }
        } else {
          return Math.min(this._rowFactor, this.getGroupLen() - this._groupStartIndex);
        }
      }
    },

    _virtualToPhysical: function(virtualIndex) {
      var physicalIndex = (virtualIndex - this._physicalStart) % this._physicalCount;
      return physicalIndex < 0 ? this._physicalCount + physicalIndex : physicalIndex;
    },

    groupForVirtualIndex: function(virtual) {
      if (!this._grouped) {
        return {};
      } else {
        var group;
        for (group=0; group<this.groups.length; group++) {
          var groupLen = this.getGroupLen(group);
          if (groupLen > virtual) {
            break;
          } else {
            virtual -= groupLen;
          }
        }
        return {group: group, groupIndex: virtual };
      }
    },

    virtualIndexForGroup: function(group, groupIndex) {
      groupIndex = groupIndex ? Math.min(groupIndex, this.getGroupLen(group)) : 0;
      group--;
      while (group >= 0) {
        groupIndex += this.getGroupLen(group--);
      }
      return groupIndex;
    },

    dataForIndex: function(virtual, group, groupIndex) {
      if (this.data) {
        if (this._nestedGroups) {
          if (virtual < this._virtualCount) {
            return this.data[group][groupIndex];
          }
        } else {
          return this.data[virtual];
        }
      }
    },

    // Refresh the list at the current scroll position.
    refresh: function() {
      var i, deltaCount;

      // Determine scroll position & any scrollDelta that may have occurred
      var lastScrollTop = this._scrollTop;
      this._scrollTop = this.getScrollTop();
      var scrollDelta = this._scrollTop - lastScrollTop;
      this._dir = scrollDelta < 0 ? -1 : scrollDelta > 0 ? 1 : 0;

      // Adjust virtual items and positioning offset if scroll occurred
      if (Math.abs(scrollDelta) > Math.max(this._physicalSize, this._targetSize)) {
        // Random access to point in list: guess new index based on average size
        deltaCount = Math.round((scrollDelta / this._physicalAverage) * this._rowFactor);
        deltaCount = Math.max(deltaCount, -this._virtualStart);
        deltaCount = Math.min(deltaCount, this._virtualCount - this._virtualStart - 1);
        this._physicalOffset += Math.max(scrollDelta, -this._physicalOffset);
        this.changeStartIndex(deltaCount);
        // console.log(this._scrollTop, 'Random access to ' + this._virtualStart, this._physicalOffset);
      } else {
        // Incremental movement: adjust index by flipping items
        var base = this._aboveSize + this._physicalOffset;
        var margin = 0.3 * Math.max((this._physicalSize - this._targetSize, this._physicalSize));
        this._upperBound = base + margin;
        this._lowerBound = base + this._physicalSize - this._targetSize - margin;
        var flipBound = this._dir > 0 ? this._upperBound : this._lowerBound;
        if (((this._dir > 0 && this._scrollTop > flipBound) ||
             (this._dir < 0 && this._scrollTop < flipBound))) {
          var flipSize = Math.abs(this._scrollTop - flipBound);
          for (i=0; (i<this._physicalCount) && (flipSize > 0) &&
              ((this._dir < 0 && this._virtualStart > 0) || 
               (this._dir > 0 && this._virtualStart < this._virtualCount-this._physicalCount)); i++) {
            var idx = this._virtualToPhysical(this._dir > 0 ? 
              this._virtualStart : 
              this._virtualStart + this._physicalCount -1);
            var size = this._physicalSizes[idx];
            flipSize -= size;
            var cnt = this.getRowCount(this._dir);
            // console.log(this._scrollTop, 'flip ' + (this._dir > 0 ? 'down' : 'up'), cnt, this._virtualStart, this._physicalOffset);
            if (this._dir > 0) {
              // When scrolling down, offset is adjusted based on previous item's size
              this._physicalOffset += size;
              // console.log('  ->', this._virtualStart, size, this._physicalOffset);
            }
            this.changeStartIndex(cnt);
            if (this._dir < 0) {
              this._repositionedItems.push(this._virtualStart);
            }
          }
        }
      }

      // Assign data to items lazily if scrolling, otherwise force
      if (this._updateItems(!scrollDelta)) {
        // Position items after bindings resolve (method varies based on O.o impl)
        if (Observer.hasObjectObserve) {
          this.async(this._boundPositionItems);
        } else {
          Platform.flush();
          Platform.endOfMicrotask(this._boundPositionItems);
        }
      }
    },

    _updateItems: function(force) {
      var i, virtualIndex, physicalIndex;
      var needsReposition = false;
      var groupIndex = this._groupStart;
      var groupItemIndex = this._groupStartIndex;
      for (i = 0; i < this._physicalCount; ++i) {
        virtualIndex = this._virtualStart + i;
        physicalIndex = this._virtualToPhysical(virtualIndex);
        // Update physical item with new user data and list metadata
        needsReposition = 
          this._updateItemData(force, physicalIndex, virtualIndex, groupIndex, groupItemIndex) || needsReposition;
        // Increment
        groupItemIndex++;
        if (this.groups && groupIndex < this.groups.length - 1) {
          if (groupItemIndex >= this.getGroupLen(groupIndex)) {
            groupItemIndex = 0;
            groupIndex++;
          }
        }
      }
      return needsReposition;
    },

    _positionItems: function() {
      var i, virtualIndex, physicalIndex, physicalItem;

      // Measure
      this.updateMetrics();

      // Pre-positioning tasks
      if (this._dir < 0) {
        // When going up, remove offset after measuring size for
        // new data for item being moved from bottom to top
        while (this._repositionedItems.length) {
          virtualIndex = this._repositionedItems.pop();
          physicalIndex = this._virtualToPhysical(virtualIndex);
          this._physicalOffset -= this._physicalSizes[physicalIndex];
          // console.log('  <-', virtualIndex, this._physicalSizes[physicalIndex], this._physicalOffset);
        }
        // Adjust scroll position to home into top when going up
        if (this._scrollTop + this._targetSize < this._viewportSize) {
          this._updateScrollPosition(this._scrollTop);
        }
      }

      // Position items
      var divider, upperBound, lowerBound;
      var rowx = 0;
      var x = this._rowMargin;
      var y = this._physicalOffset;
      var lastHeight = 0;
      for (i = 0; i < this._physicalCount; ++i) {
        // Calculate indices
        virtualIndex = this._virtualStart + i;
        physicalIndex = this._virtualToPhysical(virtualIndex);
        physicalItem = this._physicalItems[physicalIndex];
        // Position divider
        if (physicalItem._isDivider) {
          if (rowx !== 0) {
            y += lastHeight;
            rowx = 0;
          }
          divider = this._physicalDividers[physicalIndex];
          x = this._rowMargin;
          if (divider && (divider._translateX != x || divider._translateY != y)) {
            divider.style.opacity = 1;
            if (this.grid) {
              divider.style.width = this.width * this._rowFactor + 'px';
            }
            divider.style.transform = divider.style.webkitTransform =
              'translate3d(' + x + 'px,' + y + 'px,0)';
            divider._translateX = x;
            divider._translateY = y;
          }
          y += this._dividerSizes[physicalIndex];
        }
        // Position item
        if (physicalItem._translateX != x || physicalItem._translateY != y) {
          physicalItem.style.opacity = 1;
          physicalItem.style.transform = physicalItem.style.webkitTransform =
            'translate3d(' + x + 'px,' + y + 'px,0)';
          physicalItem._translateX = x;
          physicalItem._translateY = y;
        }
        // Increment offsets
        lastHeight = this._itemSizes[physicalIndex];
        if (this.grid) {
          rowx++;
          if (rowx >= this._rowFactor) {
            rowx = 0;
            y += lastHeight;
          }
          x = this._rowMargin + rowx * this.width;
        } else {
          y += lastHeight;
        }
      }

      if (this._scrollTop >= 0) {
        this._updateViewportHeight();
      }
    },

    _updateViewportHeight: function() {
      var remaining = Math.max(this._virtualCount - this._virtualStart - this._physicalCount, 0);
      remaining = Math.ceil(remaining / this._rowFactor);
      var vs = this._physicalOffset + this._physicalSize + remaining * this._physicalAverage;
      if (this._viewportSize != vs) {
        // console.log(this._scrollTop, 'adjusting viewport height', vs - this._viewportSize, vs);
        this._viewportSize = vs;
        this.$.viewport.style.height = this._viewportSize + 'px';
        this.syncScroller();
      }
    },

    _updateScrollPosition: function(scrollTop) {
      var deltaHeight = this._virtualStart === 0 ? this._physicalOffset :
        Math.min(scrollTop + this._physicalOffset, 0);
      if (deltaHeight) {
        // console.log(scrollTop, 'adjusting scroll pos', this._virtualStart, -deltaHeight, scrollTop - deltaHeight);
        if (this.adjustPositionAllowed) {
          this._scrollTop = this.setScrollTop(scrollTop - deltaHeight);
        }
        this._physicalOffset -= deltaHeight;
      }
    },

    // list selection
    tapHandler: function(e) {
      var n = e.target;
      var p = e.path;
      if (!this.selectionEnabled || (n === this)) {
        return;
      }
      requestAnimationFrame(function() {
        // Gambit: only select the item if the tap wasn't on a focusable child
        // of the list (since anything with its own action should be focusable
        // and not result in result in list selection).  To check this, we
        // asynchronously check that shadowRoot.activeElement is null, which 
        // means the tapped item wasn't focusable. On polyfill where
        // activeElement doesn't follow the data-hinding part of the spec, we
        // can check that document.activeElement is the list itself, which will
        // catch focus in lieu of the tapped item being focusable, as we make
        // the list focusable (tabindex="-1") for this purpose.  Note we also
        // allow the list items themselves to be focusable if desired, so those
        // are excluded as well.
        var active = window.ShadowDOMPolyfill ? 
            wrap(document.activeElement) : this.shadowRoot.activeElement;
        if (active && (active != this) && (active.parentElement != this) && 
            (document.activeElement != document.body)) {
          return;
        }
        // Unfortunately, Safari does not focus certain form controls via mouse,
        // so we also blacklist input, button, & select
        // (https://bugs.webkit.org/show_bug.cgi?id=118043)
        if ((p[0].localName == 'input') || 
            (p[0].localName == 'button') || 
            (p[0].localName == 'select')) {
          return;
        }

        var model = n.templateInstance && n.templateInstance.model;
        if (model) {
          var data = this.dataForIndex(model.index, model.groupIndex, model.groupItemIndex);
          var item = this._physicalItems[model.physicalIndex];
          if (!this.multi && data == this.selection) {
            this.$.selection.select(null);
          } else {
            this.$.selection.select(data);
          }
          this.asyncFire('core-activate', {data: data, item: item});
        }
      }.bind(this));
    },

    selectedHandler: function(e, detail) {
      this.selection = this.$.selection.getSelection();
      var id = this.indexesForData(detail.item);
      // TODO(sorvell): we should be relying on selection to store the
      // selected data but we want to optimize for lookup.
      this._selectedData.set(detail.item, detail.isSelected);
      if (id.physical >= 0 && id.virtual >= 0) {
        this.refresh();
      }
    },

    /**
     * Select the list item at the given index.
     *
     * @method selectItem
     * @param {number} index 
     */
    selectItem: function(index) {
      if (!this.selectionEnabled) {
        return;
      }
      var data = this.data[index];
      if (data) {
        this.$.selection.select(data);
      }
    },

    /**
     * Set the selected state of the list item at the given index.
     *
     * @method setItemSelected
     * @param {number} index 
     * @param {boolean} isSelected 
     */
    setItemSelected: function(index, isSelected) {
      var data = this.data[index];
      if (data) {
        this.$.selection.setItemSelected(data, isSelected);
      }
    },

    indexesForData: function(data) {
      var virtual = -1;
      var groupsLen = 0;
      if (this._nestedGroups) {
        for (var i=0; i<this.groups.length; i++) {
          virtual = this.data[i].indexOf(data);
          if (virtual < 0) {
            groupsLen += this.data[i].length;
          } else {
            virtual += groupsLen;
            break;
          }
        }
      } else {
        virtual = this.data.indexOf(data);
      }
      var physical = this.virtualToPhysicalIndex(virtual);
      return { virtual: virtual, physical: physical };
    },

    virtualToPhysicalIndex: function(index) {
      for (var i=0, l=this._physicalData.length; i<l; i++) {
        if (this._physicalData[i].index === index) {
          return i;
        }
      }
      return -1;
    },

    /**
     * Clears the current selection state of the list.
     *
     * @method clearSelection
     */
    clearSelection: function() {
      this._clearSelection();
      this.refresh();
    },

    _clearSelection: function() {
      this._selectedData = new WeakMap();
      this.$.selection.clear();
      this.selection = this.$.selection.getSelection();
    },

    _getFirstVisibleIndex: function() {
      for (var i=0; i<this._physicalCount; i++) {
        var virtualIndex = this._virtualStart + i;
        var physicalIndex = this._virtualToPhysical(virtualIndex);
        var item = this._physicalItems[physicalIndex];
        if (!item.hidden && item._translateY >= this._scrollTop - this._aboveSize) {
          return virtualIndex;
        }
      }
    },

    _resetIndex: function(index) {
      index = Math.min(index, this._virtualCount-1);
      index = Math.max(index, 0);
      this.changeStartIndex(index - this._virtualStart);
      this._scrollTop = this.setScrollTop(this._aboveSize + (index / this._rowFactor) * this._physicalAverage);
      this._physicalOffset = this._scrollTop - this._aboveSize;
      this._dir = 0;
    },

    /**
     * Scroll to an item.
     *
     * Note, when grouping is used, the index is based on the
     * total flattened number of items.  For scrolling to an item
     * within a group, use the `scrollToGroupItem` API.
     *
     * @method scrollToItem
     * @param {number} index 
     */
    scrollToItem: function(index) {
      this.scrollToGroupItem(null, index);
    },

    /**
     * Scroll to a group.
     *
     * @method scrollToGroup
     * @param {number} group 
     */
    scrollToGroup: function(group) {
      this.scrollToGroupItem(group, 0);
    },

    /**
     * Scroll to an item within a group.
     *
     * @method scrollToGroupItem
     * @param {number} group 
     * @param {number} index 
     */
    scrollToGroupItem: function(group, index) {
      if (group != null) {
        index = this.virtualIndexForGroup(group, index);
      }
      this._resetIndex(index);
      this.refresh();
    }

  }, Polymer.CoreResizable));

})();
;


    Polymer('core-iconset-svg', {


      /**
       * The size of an individual icon. Note that icons must be square.
       *
       * @attribute iconSize
       * @type number
       * @default 24
       */
      iconSize: 24,
      type: 'iconset',

      created: function() {
        this._icons = {};
      },

      ready: function() {
        this.super();
        this.updateIcons();
      },

      iconById: function(id) {
        return this._icons[id] || (this._icons[id] = this.querySelector('[id="' + id +'"]'));
      },

      cloneIcon: function(id) {
        var icon = this.iconById(id);
        if (icon) {
          var content = icon.cloneNode(true);
          content.removeAttribute('id');
          var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 ' + this.iconSize + ' ' +
              this.iconSize);
          // NOTE(dfreedm): work around https://crbug.com/370136
          svg.style.pointerEvents = 'none';
          svg.appendChild(content);
          return svg;
        }
      },

      get iconNames() {
        if (!this._iconNames) {
          this._iconNames = this.findIconNames();
        }
        return this._iconNames;
      },

      findIconNames: function() {
        var icons = this.querySelectorAll('[id]').array();
        if (icons.length) {
          return icons.map(function(n){ return n.id });
        }
      },

      /**
       * Applies an icon to the given element. The svg icon is added to the
       * element's shadowRoot if one exists or directly to itself.
       *
       * @method applyIcon
       * @param {Element} element The element to which the icon is
       * applied.
       * @param {String|Number} icon The name the icon to apply.
       * @return {Element} The icon element
       */
      applyIcon: function(element, icon) {
        var root = element;
        // remove old
        var old = root.querySelector('svg');
        if (old) {
          old.remove();
        }
        // install new
        var svg = this.cloneIcon(icon);
        if (!svg) {
          return;
        }
        svg.setAttribute('height', '100%');
        svg.setAttribute('width', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.display = 'block';
        root.insertBefore(svg, root.firstElementChild);
        return svg;
      },
      
      /**
       * Tell users of the iconset, that the set has loaded.
       * This finds all elements matching the selector argument and calls 
       * the method argument on them.
       * @method updateIcons
       * @param selector {string} css selector to identify iconset users, 
       * defaults to '[icon]'
       * @param method {string} method to call on found elements, 
       * defaults to 'updateIcon'
       */
      updateIcons: function(selector, method) {
        selector = selector || '[icon]';
        method = method || 'updateIcon';
        var deep = window.ShadowDOMPolyfill ? '' : 'html /deep/ ';
        var i$ = document.querySelectorAll(deep + selector);
        for (var i=0, e; e=i$[i]; i++) {
          if (e[method]) {
            e[method].call(e);
          }
        }
      }
      

    });

  ;


  (function() {

    var waveMaxRadius = 150;
    //
    // INK EQUATIONS
    //
    function waveRadiusFn(touchDownMs, touchUpMs, anim) {
      // Convert from ms to s
      var touchDown = touchDownMs / 1000;
      var touchUp = touchUpMs / 1000;
      var totalElapsed = touchDown + touchUp;
      var ww = anim.width, hh = anim.height;
      // use diagonal size of container to avoid floating point math sadness
      var waveRadius = Math.min(Math.sqrt(ww * ww + hh * hh), waveMaxRadius) * 1.1 + 5;
      var duration = 1.1 - .2 * (waveRadius / waveMaxRadius);
      var tt = (totalElapsed / duration);

      var size = waveRadius * (1 - Math.pow(80, -tt));
      return Math.abs(size);
    }

    function waveOpacityFn(td, tu, anim) {
      // Convert from ms to s.
      var touchDown = td / 1000;
      var touchUp = tu / 1000;
      var totalElapsed = touchDown + touchUp;

      if (tu <= 0) {  // before touch up
        return anim.initialOpacity;
      }
      return Math.max(0, anim.initialOpacity - touchUp * anim.opacityDecayVelocity);
    }

    function waveOuterOpacityFn(td, tu, anim) {
      // Convert from ms to s.
      var touchDown = td / 1000;
      var touchUp = tu / 1000;

      // Linear increase in background opacity, capped at the opacity
      // of the wavefront (waveOpacity).
      var outerOpacity = touchDown * 0.3;
      var waveOpacity = waveOpacityFn(td, tu, anim);
      return Math.max(0, Math.min(outerOpacity, waveOpacity));
    }

    // Determines whether the wave should be completely removed.
    function waveDidFinish(wave, radius, anim) {
      var waveOpacity = waveOpacityFn(wave.tDown, wave.tUp, anim);

      // If the wave opacity is 0 and the radius exceeds the bounds
      // of the element, then this is finished.
      return waveOpacity < 0.01 && radius >= Math.min(wave.maxRadius, waveMaxRadius);
    };

    function waveAtMaximum(wave, radius, anim) {
      var waveOpacity = waveOpacityFn(wave.tDown, wave.tUp, anim);

      return waveOpacity >= anim.initialOpacity && radius >= Math.min(wave.maxRadius, waveMaxRadius);
    }

    //
    // DRAWING
    //
    function drawRipple(ctx, x, y, radius, innerAlpha, outerAlpha) {
      // Only animate opacity and transform
      if (outerAlpha !== undefined) {
        ctx.bg.style.opacity = outerAlpha;
      }
      ctx.wave.style.opacity = innerAlpha;

      var s = radius / (ctx.containerSize / 2);
      var dx = x - (ctx.containerWidth / 2);
      var dy = y - (ctx.containerHeight / 2);

      ctx.wc.style.webkitTransform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      ctx.wc.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';

      // 2d transform for safari because of border-radius and overflow:hidden clipping bug.
      // https://bugs.webkit.org/show_bug.cgi?id=98538
      ctx.wave.style.webkitTransform = 'scale(' + s + ',' + s + ')';
      ctx.wave.style.transform = 'scale3d(' + s + ',' + s + ',1)';
    }

    //
    // SETUP
    //
    function createWave(elem) {
      var elementStyle = window.getComputedStyle(elem);
      var fgColor = elementStyle.color;

      var inner = document.createElement('div');
      inner.style.backgroundColor = fgColor;
      inner.classList.add('wave');

      var outer = document.createElement('div');
      outer.classList.add('wave-container');
      outer.appendChild(inner);

      var container = elem.$.waves;
      container.appendChild(outer);

      elem.$.bg.style.backgroundColor = fgColor;

      var wave = {
        bg: elem.$.bg,
        wc: outer,
        wave: inner,
        waveColor: fgColor,
        maxRadius: 0,
        isMouseDown: false,
        mouseDownStart: 0.0,
        mouseUpStart: 0.0,
        tDown: 0,
        tUp: 0
      };
      return wave;
    }

    function removeWaveFromScope(scope, wave) {
      if (scope.waves) {
        var pos = scope.waves.indexOf(wave);
        scope.waves.splice(pos, 1);
        // FIXME cache nodes
        wave.wc.remove();
      }
    };

    // Shortcuts.
    var pow = Math.pow;
    var now = Date.now;
    if (window.performance && performance.now) {
      now = performance.now.bind(performance);
    }

    function cssColorWithAlpha(cssColor, alpha) {
        var parts = cssColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (typeof alpha == 'undefined') {
            alpha = 1;
        }
        if (!parts) {
          return 'rgba(255, 255, 255, ' + alpha + ')';
        }
        return 'rgba(' + parts[1] + ', ' + parts[2] + ', ' + parts[3] + ', ' + alpha + ')';
    }

    function dist(p1, p2) {
      return Math.sqrt(pow(p1.x - p2.x, 2) + pow(p1.y - p2.y, 2));
    }

    function distanceFromPointToFurthestCorner(point, size) {
      var tl_d = dist(point, {x: 0, y: 0});
      var tr_d = dist(point, {x: size.w, y: 0});
      var bl_d = dist(point, {x: 0, y: size.h});
      var br_d = dist(point, {x: size.w, y: size.h});
      return Math.max(tl_d, tr_d, bl_d, br_d);
    }

    Polymer('paper-ripple', {

      /**
       * The initial opacity set on the wave.
       *
       * @attribute initialOpacity
       * @type number
       * @default 0.25
       */
      initialOpacity: 0.25,

      /**
       * How fast (opacity per second) the wave fades out.
       *
       * @attribute opacityDecayVelocity
       * @type number
       * @default 0.8
       */
      opacityDecayVelocity: 0.8,

      backgroundFill: true,
      pixelDensity: 2,

      eventDelegates: {
        down: 'downAction',
        up: 'upAction'
      },

      ready: function() {
        this.waves = [];
      },

      downAction: function(e) {
        var wave = createWave(this);

        this.cancelled = false;
        wave.isMouseDown = true;
        wave.tDown = 0.0;
        wave.tUp = 0.0;
        wave.mouseUpStart = 0.0;
        wave.mouseDownStart = now();

        var rect = this.getBoundingClientRect();
        var width = rect.width;
        var height = rect.height;
        var touchX = e.x - rect.left;
        var touchY = e.y - rect.top;

        wave.startPosition = {x:touchX, y:touchY};

        if (this.classList.contains("recenteringTouch")) {
          wave.endPosition = {x: width / 2,  y: height / 2};
          wave.slideDistance = dist(wave.startPosition, wave.endPosition);
        }
        wave.containerSize = Math.max(width, height);
        wave.containerWidth = width;
        wave.containerHeight = height;
        wave.maxRadius = distanceFromPointToFurthestCorner(wave.startPosition, {w: width, h: height});

        // The wave is circular so constrain its container to 1:1
        wave.wc.style.top = (wave.containerHeight - wave.containerSize) / 2 + 'px';
        wave.wc.style.left = (wave.containerWidth - wave.containerSize) / 2 + 'px';
        wave.wc.style.width = wave.containerSize + 'px';
        wave.wc.style.height = wave.containerSize + 'px';

        this.waves.push(wave);

        if (!this._loop) {
          this._loop = this.animate.bind(this, {
            width: width,
            height: height
          });
          requestAnimationFrame(this._loop);
        }
        // else there is already a rAF
      },

      upAction: function() {
        for (var i = 0; i < this.waves.length; i++) {
          // Declare the next wave that has mouse down to be mouse'ed up.
          var wave = this.waves[i];
          if (wave.isMouseDown) {
            wave.isMouseDown = false
            wave.mouseUpStart = now();
            wave.mouseDownStart = 0;
            wave.tUp = 0.0;
            break;
          }
        }
        this._loop && requestAnimationFrame(this._loop);
      },

      cancel: function() {
        this.cancelled = true;
      },

      animate: function(ctx) {
        var shouldRenderNextFrame = false;

        var deleteTheseWaves = [];
        // The oldest wave's touch down duration
        var longestTouchDownDuration = 0;
        var longestTouchUpDuration = 0;
        // Save the last known wave color
        var lastWaveColor = null;
        // wave animation values
        var anim = {
          initialOpacity: this.initialOpacity,
          opacityDecayVelocity: this.opacityDecayVelocity,
          height: ctx.height,
          width: ctx.width
        }

        for (var i = 0; i < this.waves.length; i++) {
          var wave = this.waves[i];

          if (wave.mouseDownStart > 0) {
            wave.tDown = now() - wave.mouseDownStart;
          }
          if (wave.mouseUpStart > 0) {
            wave.tUp = now() - wave.mouseUpStart;
          }

          // Determine how long the touch has been up or down.
          var tUp = wave.tUp;
          var tDown = wave.tDown;
          longestTouchDownDuration = Math.max(longestTouchDownDuration, tDown);
          longestTouchUpDuration = Math.max(longestTouchUpDuration, tUp);

          // Obtain the instantenous size and alpha of the ripple.
          var radius = waveRadiusFn(tDown, tUp, anim);
          var waveAlpha =  waveOpacityFn(tDown, tUp, anim);
          var waveColor = cssColorWithAlpha(wave.waveColor, waveAlpha);
          lastWaveColor = wave.waveColor;

          // Position of the ripple.
          var x = wave.startPosition.x;
          var y = wave.startPosition.y;

          // Ripple gravitational pull to the center of the canvas.
          if (wave.endPosition) {

            // This translates from the origin to the center of the view  based on the max dimension of
            var translateFraction = Math.min(1, radius / wave.containerSize * 2 / Math.sqrt(2) );

            x += translateFraction * (wave.endPosition.x - wave.startPosition.x);
            y += translateFraction * (wave.endPosition.y - wave.startPosition.y);
          }

          // If we do a background fill fade too, work out the correct color.
          var bgFillColor = null;
          if (this.backgroundFill) {
            var bgFillAlpha = waveOuterOpacityFn(tDown, tUp, anim);
            bgFillColor = cssColorWithAlpha(wave.waveColor, bgFillAlpha);
          }

          // Draw the ripple.
          drawRipple(wave, x, y, radius, waveAlpha, bgFillAlpha);

          // Determine whether there is any more rendering to be done.
          var maximumWave = waveAtMaximum(wave, radius, anim);
          var waveDissipated = waveDidFinish(wave, radius, anim);
          var shouldKeepWave = !waveDissipated || maximumWave;
          // keep rendering dissipating wave when at maximum radius on upAction
          var shouldRenderWaveAgain = wave.mouseUpStart ? !waveDissipated : !maximumWave;
          shouldRenderNextFrame = shouldRenderNextFrame || shouldRenderWaveAgain;
          if (!shouldKeepWave || this.cancelled) {
            deleteTheseWaves.push(wave);
          }
       }

        if (shouldRenderNextFrame) {
          requestAnimationFrame(this._loop);
        }

        for (var i = 0; i < deleteTheseWaves.length; ++i) {
          var wave = deleteTheseWaves[i];
          removeWaveFromScope(this, wave);
        }

        if (!this.waves.length && this._loop) {
          // clear the background color
          this.$.bg.style.backgroundColor = null;
          this._loop = null;
          this.fire('core-transitionend');
        }
      }

    });

  })();

;


  (function() {

    var p = {

      eventDelegates: {
        down: 'downAction',
        up: 'upAction'
      },

      toggleBackground: function() {
        if (this.active) {

          if (!this.$.bg) {
            var bg = document.createElement('div');
            bg.setAttribute('id', 'bg');
            bg.setAttribute('fit', '');
            bg.style.opacity = 0.25;
            this.$.bg = bg;
            this.shadowRoot.insertBefore(bg, this.shadowRoot.firstChild);
          }
          this.$.bg.style.backgroundColor = getComputedStyle(this).color;

        } else {

          if (this.$.bg) {
            this.$.bg.style.backgroundColor = '';
          }
        }
      },

      activeChanged: function() {
        this.super();

        if (this.toggle && (!this.lastEvent || this.matches(':host-context([noink])'))) {
          this.toggleBackground();
        }
      },

      pressedChanged: function() {
        this.super();

        if (!this.lastEvent) {
          return;
        }

        if (this.$.ripple && !this.hasAttribute('noink')) {
          if (this.pressed) {
            this.$.ripple.downAction(this.lastEvent);
          } else {
            this.$.ripple.upAction();
          }
        }

        this.adjustZ();
      },

      focusedChanged: function() {
        this.adjustZ();
      },

      disabledChanged: function() {
        this._disabledChanged();
        this.adjustZ();
      },

      recenteringTouchChanged: function() {
        if (this.$.ripple) {
          this.$.ripple.classList.toggle('recenteringTouch', this.recenteringTouch);
        }
      },

      fillChanged: function() {
        if (this.$.ripple) {
          this.$.ripple.classList.toggle('fill', this.fill);
        }
      },

      adjustZ: function() {
        if (!this.$.shadow) {
          return;
        }
        if (this.active) {
          this.$.shadow.setZ(2);
        } else if (this.disabled) {
          this.$.shadow.setZ(0);
        } else if (this.focused) {
          this.$.shadow.setZ(3);
        } else {
          this.$.shadow.setZ(1);
        }
      },

      downAction: function(e) {
        this._downAction();

        if (this.hasAttribute('noink')) {
          return;
        }

        this.lastEvent = e;
        if (!this.$.ripple) {
          var ripple = document.createElement('paper-ripple');
          ripple.setAttribute('id', 'ripple');
          ripple.setAttribute('fit', '');
          if (this.recenteringTouch) {
            ripple.classList.add('recenteringTouch');
          }
          if (!this.fill) {
            ripple.classList.add('circle');
          }
          this.$.ripple = ripple;
          this.shadowRoot.insertBefore(ripple, this.shadowRoot.firstChild);
          // No need to forward the event to the ripple because the ripple
          // is triggered in activeChanged
        }
      },

      upAction: function() {
        this._upAction();

        if (this.toggle) {
          this.toggleBackground();
          if (this.$.ripple) {
            this.$.ripple.cancel();
          }
        }
      }

    };

    Polymer.mixin2(p, Polymer.CoreFocusable);
    Polymer('paper-button-base',p);

  })();

;

    Polymer('paper-icon-button',{

      publish: {

        /**
         * The URL of an image for the icon. If the src property is specified,
         * the icon property should not be.
         *
         * @attribute src
         * @type string
         * @default ''
         */
        src: '',

        /**
         * Specifies the icon name or index in the set of icons available in
         * the icon's icon set. If the icon property is specified,
         * the src property should not be.
         *
         * @attribute icon
         * @type string
         * @default ''
         */
        icon: '',

        recenteringTouch: true,
        fill: false

      },

      iconChanged: function(oldIcon) {
        var label = this.getAttribute('aria-label');
        if (!label || label === oldIcon) {
          this.setAttribute('aria-label', this.icon);
        }
      }

    });

  ;

				var appolymer = document.querySelector('#appolymer');
				appolymer.minimizeButtonHandler = function() {
					chrome.app.window.current().minimize();
				};
				appolymer.maximizeButtonHandler = function() {
					if (chrome.app.window.current().isMaximized())
						chrome.app.window.current().restore();
					else
						chrome.app.window.current().maximize();
				};
				appolymer.exitButtonHandler = function() {
					chrome.app.window.current().close();
				};
				appolymer.cpuInfo = '';
				chrome.system.cpu.getInfo(function(cpuInfo) {
					appolymer.cpuInfo = JSON.stringify(cpuInfo, null, '    ');
				});
				