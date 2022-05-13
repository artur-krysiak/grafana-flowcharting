import { XGraph } from 'graph_class';
import { Rule } from 'rule_class';
import { EventMap } from 'mapping_class';
import { TooltipHandler } from 'tooltipHandler';
import { $GF, GFVariables, GFLog } from 'globals_class';
import { XCell } from 'cell_class';
import { ObjectMetric } from 'metric_class';
import { GFEvents } from 'flowcharting_base';
import { RulesHandler } from 'rules_handler';

const stateSignalsArray = ['state_initialized', 'state_updated', 'state_freed'] as const;
type stateSignals = typeof stateSignalsArray[number];

/**
 * Class for state of one cell
 *
 * @export
 * @class State
 */
export class State {
  _xcell: XCell; // mxCell State
  uid: string; // cell ID in mxcell
  private _changed = false;
  private _matched = false;
  private _shapeState: ShapeState;
  private _tooltipState: TooltipState;
  private _iconState: IconState;
  private _eventState: EventState;
  private _textState: TextState;
  private _linkState: LinkState;
  private _variables: GFVariables;
  private _status: Map<string, any>;
  private _ObjStates: [ShapeState, TooltipState, IconState, EventState, TextState, LinkState];
  globalLevel = -1;
  highestFormattedValue = '';
  highestValue: any = undefined;
  tooltipHandler: TooltipHandler | null = null;
  reduce = true;
  private _rules: Map<string, Rule> = new Map();
  currRules: string[] = [];
  currMetrics: string[] = [];
  events: GFEvents<stateSignals> = GFEvents.create(stateSignalsArray);
  // originalText: string;

  /**
   * Creates an instance of State.
   * @param {mxCell} mxcell
   * @param {XGraph} xgraph
   * @memberof State
   */
  constructor(xcell: XCell, xgraph: XGraph) {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'constructor()');
    this.uid = $GF.genUid(this.constructor.name);
    this._xcell = xcell;
    // this._xgraph = xgraph;
    this._shapeState = new ShapeState(xgraph, xcell);
    this._tooltipState = new TooltipState(xgraph, xcell);
    this._iconState = new IconState(xgraph, xcell);
    this._eventState = new EventState(xgraph, xcell);
    this._textState = new TextState(xgraph, xcell);
    this._linkState = new LinkState(xgraph, xcell);
    this._ObjStates = [
      this._shapeState,
      this._tooltipState,
      this._iconState,
      this._eventState,
      this._textState,
      this._linkState,
    ];
    this._variables = $GF.createLocalVars();
    this._status = new Map();
    this.tooltipHandler = null;
    this.init();
    trc.after();
  }

  //############################################################################
  //### INIT/UPDATE/CHANGE/FREE
  //############################################################################
  init() {
    this._initCycle();
    $GF.events.connect('data_updated', this, this._on_global_data_received.bind(this));
    $GF.events.connect('data_processed', this, this._on_global_data_processed.bind(this));
    RulesHandler.events.connect('rule_changed', this, this._on_ruleHandler_rule_changed.bind(this));
    RulesHandler.events.connect('rule_updated', this, this._on_ruleHandler_rule_updated.bind(this));
    RulesHandler.events.connect('rule_created', this, this._on_ruleHandler_rule_created.bind(this));
    RulesHandler.events.connect('rule_deleted', this, this._on_ruleHandler_rule_deleted.bind(this));
    this.events.emit('state_initialized', this);
    return this;
  }

  update(): this {
    this.events.emit('state_updated', this);
    return this;
  }

  // complete(): this {
  //   if (!this.completed) {
  //     this.applyCycle();
  //     this.completed = true;
  //   }
  //   this.onCompleted();
  //   return this;
  // }

  change() {
    return this;
  }

  // clear(): this {
  //   // this.clearTag();
  //   return this;
  // }

  async free() {
    this.reset();
    $GF.events.disconnect('data_updated', this);
    $GF.events.disconnect('data_processed', this);
    RulesHandler.events.disconnect('rule_changed', this);
    RulesHandler.events.disconnect('rule_created', this);
    RulesHandler.events.disconnect('rule_deleted', this);
    this.events.clear();
    await this.events.emit('state_freed', this);
  }

  //############################################################################
  //### ACCESSORS
  //############################################################################
  getXCell(): XCell {
    return this._xcell;
  }

  getLevel(): number {
    return this.globalLevel;
  }

  //############################################################################
  //### LOGIC
  //############################################################################

  /**
   * Call applyState() asynchronously
   *
   * @memberof State
   */
  async async_applyCycle() {
    this.applyCycle();
  }

  /**
   * Define state according to 1 rule and 1 serie without apply display
   *
   * @returns {this}
   * @param {Rule} rule
   * @param {Metric} metric
   * @memberof State
   */
  private _setCycle(rule?: Rule): this {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'setCycle()');
    const funcName = 'setCycle';
    GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
    const rules = rule === undefined ? Array.from(this._rules.values()) : [rule];
    rules.map(async (r: Rule) => {
      let beginPerf = Date.now();
      if (!r.isHidden()) {
        const shapeMaps = r.getShapeMaps();
        const textMaps = r.getTextMaps();
        const linkMaps = r.getLinkMaps();
        const eventMaps = r.getEventMaps();
        this._variables.set($GF.CONSTANTS.VAR_STR_RULENAME, r.data.alias);
        r.getMetrics().forEach((metric) => {
          try {
            this.currMetrics.push(metric.getName());
            this._variables.set($GF.CONSTANTS.VAR_STR_METRIC, metric.getName);
          } catch (error) {
            GFLog.error(error);
          }
          const value = r.getValueForMetric(metric);
          const FormattedValue = r.getFormattedValue(value);
          const level = r.getThresholdLevel(value);
          const color = r.getThresholdColor(value);
          this._variables.set($GF.CONSTANTS.VAR_NUM_VALUE, value);
          this._variables.set($GF.CONSTANTS.VAR_STR_FORMATED, FormattedValue);
          this._variables.set($GF.CONSTANTS.VAR_NUM_LEVEL, level);
          this._variables.set($GF.CONSTANTS.VAR_STR_COLOR, color);
          this._variables.set($GF.CONSTANTS.VAR_STR_DATE, $GF.getCurrentDate());

          // SHAPE
          let matchedRule = false;
          let mapOptions = r.getShapeMapOptions();
          let cellValue = this._xcell.getDefaultValues(mapOptions);
          shapeMaps.forEach((shape) => {
            let k = shape.data.style;
            if (!shape.isHidden() && shape.match(cellValue, mapOptions, this._variables)) {
              let v: any = color;
              if (shape.isEligible(level)) {
                matchedRule = true;
                this._matched = true;
                this._shapeState.set(k, v, level) && this._status.set(k, v);
              }

              // TOOLTIP
              if (r.toTooltipize(level)) {
                k = 'tooltip';
                v = true;
                this._tooltipState.set('tooltip', true, level) && this._status.set(k, v);
                this._tooltipState.setTooltip(r, metric, color, FormattedValue, this._xcell.getMetadatas());
              }
              // ICONS
              if (r.toIconize(level)) {
                k = 'icon';
                v = true;
                this._iconState.set('icon', true, level) && this._status.set(k, v);
              }
            }
          });

          // TEXT
          mapOptions = r.getTextMapOptions();
          cellValue = this._xcell.getDefaultValues(mapOptions);
          textMaps.forEach((text) => {
            const k = 'label';
            if (!text.isHidden() && text.match(cellValue, mapOptions, this._variables)) {
              if (text.isEligible(level)) {
                matchedRule = true;
                this._matched = true;
                const textScoped = this._variables.replaceText(FormattedValue);
                const v = text.getReplaceText(this._textState.getMatchValue(k), textScoped);
                this._textState.set(k, v, level) && this._status.set(k, v);
              }
            }
          });

          // EVENTS
          mapOptions = r.getEventMapOptions();
          cellValue = this._xcell.getDefaultValues(mapOptions);
          eventMaps.forEach((event) => {
            const k = event.data.style;
            if (!event.isHidden() && event.match(cellValue, mapOptions, this._variables)) {
              if (event.isEligible(level)) {
                matchedRule = true;
                this._matched = true;
                const v = this._variables.eval(event.data.value);
                this._eventState.set(k, v, level) && this._status.set(k, v);
              }
            }
          });

          // LINK
          mapOptions = r.getEventMapOptions();
          cellValue = this._xcell.getDefaultValues(mapOptions);
          linkMaps.forEach((link) => {
            const k = 'link';
            if (!link.isHidden() && link.match(cellValue, mapOptions, this._variables)) {
              if (link.isEligible(level)) {
                matchedRule = true;
                this._matched = true;
                const v = this._variables.replaceText(link.getLink());
                this._linkState.set(k, v, level) && this._status.set(k, v);
              }
            }
          });

          if (matchedRule) {
            this.currRules.push(r.data.alias);
            if (level > this.globalLevel) {
              this.globalLevel = level;
              this.highestValue = value;
              this.highestFormattedValue = FormattedValue;
            }
            if (level >= r.highestLevel) {
              r.highestLevel = level;
              r.highestValue = value;
              r.highestFormattedValue = FormattedValue;
              r.highestColor = color;
            }
          }
        });
      }
      let endPerf = Date.now();
      r.execTimes += endPerf - beginPerf;
    });
    trc.after();
    return this;
  }

  /**
   * Restore initial status of state without apply display.
   * Use applyState() to apply on graph (color, level and text)
   *
   * @returns {this}
   * @memberof State
   */
  // TODO :
  // [ ] : never called
  // [ ] : How to reset state when rules unapplied
  _unsetState(): this {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'unsetState()');
    this._eventState.unset();
    this._textState.unset();
    this._linkState.unset();
    this._tooltipState.unset();
    this._iconState.unset();
    this._matched = false;
    trc.after();
    return this;
  }

  /**
   * Get Level in text
   *
   * @returns {number}
   * @memberof State
   */
  getTextLevel(): string {
    return this.globalLevel === -1 ? '' : this.globalLevel.toString();
  }

  // TODO : what for and why ?
  getStatus(key: gf.TStyleKeys): string {
    let style: string | null | undefined = this._status.get(key);
    if (style !== undefined && style !== null) {
      return style;
    }
    style = this._xcell.getStyle(key);
    if (style === null) {
      style = '';
    }
    this._status.set(key, style);
    return style;
  }

  haveStatus(key: string): boolean {
    return this._status.has(key);
  }

  /**
   * Return true if is a shape/vertex
   *
   * @returns
   * @memberof State
   */
  isShape(): boolean {
    return this._xcell.getMxCell().isVertex();
  }

  /**
   * Return true if is a arrow/connector
   *
   * @returns
   * @memberof State
   */
  isConnector(): boolean {
    return this._xcell.getMxCell().isEdge();
  }

  /**
   * Return the name of the shape
   *
   * @returns {string}
   * @memberof State
   */
  getShapeName(): string {
    if (this._xcell) {
      const name = this._xcell.getStyle('shape');
      if (name === null) {
        return '';
      }
      return name;
    }
    return 'Unknown';
  }

  /**
   *Return all styles/properties 'draw.io'
   *
   * @returns {string}
   * @memberof State
   */
  getShapeStyles(): string {
    if (this._xcell) {
      return this._xcell.getMxCell().style;
    }
    return 'Unknown';
  }

  /**
   * Apply new state
   *
   * @returns {this}
   * @memberof State
   */
  applyCycle(): this {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'applyState()');
    const funcName = 'applyCycle';
    GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
    if (this._matched || this._changed) {
      this._changed = true;
      this._ObjStates.map(async (o: { apply: CallableFunction }) => {
        o.apply();
      });
    }
    trc.after();
    return this;
  }

  /**
   * Reset and restore state
   *
   * @returns {this}
   * @memberof State
   */
  reset(): this {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'reset()');
    this._ObjStates.map(async (o: { reset: CallableFunction }) => {
      o.reset();
    });
    // this._shapeState.reset();
    // this._tooltipState.reset();
    // this._iconState.reset();
    // this._textState.reset();
    // this._eventState.reset();
    // this._linkState.reset();
    this._variables.clear();
    this._status.clear();
    this.globalLevel = -1;
    this.highestFormattedValue = '';
    this.highestValue = undefined;
    this._changed = false;
    trc.after();
    return this;
  }

  /**
   * Prepare state for a new rule and serie
   *
   * @returns {this}
   * @memberof State
   */
  private async _initCycle() {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'prepare()');
    const funcName = 'initCycle';
    GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
    if (this._changed) {
      await Promise.all(
        this._ObjStates.map(async (o: { prepare: CallableFunction }) => {
          o.prepare();
        })
      );
      this._variables.clear();
      this._status.clear();
      this.globalLevel = -1;
      this.highestFormattedValue = '';
      this.currMetrics = [];
      this.currRules = [];
      this.highestValue = undefined;
      this._matched = false;
    }
    trc.after();
    return this;
  }

  /**
   * Highlight mxcell
   *
   * @returns {this}
   * @memberof State
   */
  highlightCell(): this {
    this._xcell.highlight();
    return this;
  }

  /**
   * Unhighlight mxcell
   *
   * @returns {this}
   * @memberof State
   */
  unhighlightCell(): this {
    this._xcell.highlight(false);
    return this;
  }

  //
  // Rules
  //

  /**
   * Match rule
   *
   * @param {*} rule
   * @returns {boolean}
   * @memberof State
   */
  private _matchRule(rule: Rule): boolean {
    let mapOptions = rule.getShapeMapOptions();
    let cellValue = this._xcell.getDefaultValues(mapOptions);
    if (rule.matchShape(cellValue, mapOptions)) {
      return true;
    }
    mapOptions = rule.getTextMapOptions();
    cellValue = this._xcell.getDefaultValues(mapOptions);
    if (rule.matchText(cellValue, mapOptions)) {
      return true;
    }
    mapOptions = rule.getLinkMapOptions();
    cellValue = this._xcell.getDefaultValues(mapOptions);
    if (rule.matchLink(cellValue, mapOptions)) {
      return true;
    }
    mapOptions = rule.getEventMapOptions();
    cellValue = this._xcell.getDefaultValues(mapOptions);
    if (rule.matchEvent(cellValue, mapOptions)) {
      return true;
    }
    return false;
  }

  // private _clearRules(): this {
  //   this._rules.clear();
  //   this._completed = false;
  //   return this;
  // }

  private _updateRule(rule?: Rule): this {
    if (rule !== null && rule !== undefined) {
      if (this._matchRule(rule)) {
        this._rules.set(rule.uid, rule);
      } else {
        this._rules.delete(rule.uid);
      }
    }
    return this;
  }

  removeRule(rule: Rule): this {
    if (rule !== null && rule !== undefined && this.hasRule(rule)) {
      this._rules.delete(rule.uid);
      this.change();
      // this.complete();
    }
    return this;
  }

  hasRule(rule?: Rule): boolean {
    if (rule) {
      return this._rules.has(rule.uid);
    }
    return false;
  }

  // changeWithRule(rule: Rule): this {
  //   if (rule !== null && rule !== undefined) {
  //     if (this._matchRule(rule) || this.hasRule(rule)) {
  //       if (this._completed) {
  //         this._completed = false;
  //         this.initCycle();
  //       }
  //       this._updateRule(rule);
  //     }
  //   }
  //   this.change();
  //   return this;
  // }

  // updateWithRule(rule: Rule): this {
  //   if (this.hasRule(rule)) {
  //     if (this._completed) {
  //       this._completed = false;
  //       this.initCycle();
  //     }
  //     this.setCycle(rule);
  //   }
  //   this.events.emit('state_updated', this);
  //   return this;
  // }

  //###########################################################################
  //### EVENTS
  //###########################################################################
  private _on_global_data_received() {
    this._initCycle();
  }

  private _on_global_data_processed() {
    this.applyCycle();
  }

  private _on_ruleHandler_rule_changed(rule: Rule) {
    this._updateRule(rule);
  }

  private _on_ruleHandler_rule_updated(rule: Rule) {
    this._setCycle(rule);
  }

  private _on_ruleHandler_rule_created(rule: Rule) {
    this._updateRule(rule);
  }

  private _on_ruleHandler_rule_deleted(rule: Rule) {
    this.removeRule(rule);
  }

  //
  // Events
  //
  // async onDestroyed() {
  //   const funcName = 'onDestroyed';
  //   GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
  //   this.ctrl.eventHandler.unsubscribes(this);
  //   this.ctrl.eventHandler.emit(this, 'destroyed');
  // }

  // async onRefreshed() {
  //   const funcName = 'onRefreshed';
  //   GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
  //   this.ctrl.eventHandler.emit(this, 'refreshed');
  // }

  // async onInitialized() {
  //   const funcName = 'onInitialized';
  //   GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
  //   this.ctrl.eventHandler.subscribes(this);
  //   this.ctrl.eventHandler.emit(this, 'initialized');
  // }

  // async onChanged() {
  //   const funcName = 'onChanged';
  //   GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
  //   this.ctrl.eventHandler.emit(this, 'changed');
  // }

  // async onCompleted() {
  //   const funcName = 'onCompleted';
  //   GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
  //   this.ctrl.eventHandler.emit(this, 'completed');
  // }

  //
  // RXJS Observers
  //
  // getMetric$initialized(): Observer<ObjectMetric> {
  //   const self = this;
  //   return {
  //     next: metric => {
  //       if (metric === null) {
  //         self.initCycle();
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {},
  //   };
  // }

  // getRule$completed(): Observer<ObjectMetric> {
  //   const self = this;
  //   const funcName = 'getMetric$completed';
  //   return {
  //     next: rule => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (rule !== null && !self.completed && self.rules.has(rule.uid)) {
  //         self.complete();
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {},
  //   };
  // }

  // getRule$refreshed(): Observer<Rule> {
  //   const self = this;
  //   const funcName = 'getRule$refreshed';
  //   return {
  //     next: rule => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (rule !== null && this.rules.has(rule.uid)) {
  //         if (self.completed) {
  //           self.completed = false;
  //           self.initCycle();
  //         }
  //         self.refresh(rule);
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {},
  //   };
  // }

  // getRule$changed(): Observer<Rule> {
  //   const self = this;
  //   const funcName = 'getRule$changed';
  //   return {
  //     next: rule => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (rule !== null) {
  //         if (self.matchRule(rule)) {
  //           this.rules.set(rule.uid, rule);
  //         } else {
  //           this.rules.delete(rule.uid);
  //         }
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {},
  //   };
  // }

  // getRule$destroyed(): Observer<Rule> {
  //   const self = this;
  //   const funcName = 'getRule$destroyed';
  //   return {
  //     next: rule => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (rule !== null) {
  //         self.rules.delete(rule.uid);
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {},
  //   };
  // }
}

/**
 * Mother of sub states
 *
 * @class GFState
 */
export class GFState {
  xgraph: XGraph;
  xcell: XCell;
  keys: string[] = [];
  matchedKey: Map<string, boolean> = new Map();
  ackKey: Set<string> = new Set();
  changedKey: Map<string, boolean> = new Map();
  defaultValue: Map<string, any> = new Map();
  matchValue: Map<string, any> = new Map();
  static DEFAULTLEVEL = -1;
  matchLevel: Map<string, number> = new Map();

  constructor(xgraph: XGraph, mxcell: mxCell) {
    this.xgraph = xgraph;
    this.xcell = mxcell;
    this.init_core();
  }

  init_core() {}

  addValue(key: string, value: any) {
    if (!this.hasKey(key)) {
      this.keys.push(key);
    }
    this.defaultValue.set(key, value);
    this.matchValue.set(key, value);
    this.matchLevel.set(key, GFState.DEFAULTLEVEL);
    this.matchedKey.set(key, false);
    this.changedKey.set(key, false);
  }

  hasKey(key: string): boolean {
    return this.keys.includes(key);
  }

  getDefaultValue(key: string): any | undefined {
    if (!this.hasKey(key)) {
      this.defaultValue.set(key, this.default_core(key));
    }
    return this.defaultValue.get(key);
  }

  getMatchValue(key: string): any | undefined {
    if (!this.hasKey(key)) {
      this.matchValue.set(key, this.getDefaultValue(key));
    }
    return this.matchValue.get(key);
  }

  getTargetValue(key: string): any | undefined {
    if (this.isMatched(key)) {
      return this.getMatchValue(key);
    }
    if (this.isChanged(key)) {
      return this.getDefaultValue(key);
    }
    return undefined;
  }

  ack(key: string): this {
    if (key !== undefined) {
      if (this.isMatched(key)) {
        this.matchedKey.set(key, false);
        this.changedKey.set(key, true);
      } else if (this.isChanged(key)) {
        this.matchedKey.set(key, false);
        this.changedKey.set(key, false);
      }
      this.ackKey.add(key);
    }
    return this;
  }

  isAcked(key: string) {
    return this.ackKey.has(key);
  }

  /**
   * Insert key and value if >= level
   *
   * @param {string} key
   * @param {*} value
   * @param {number} level
   * @returns {boolean} true if applied
   * @memberof GFState
   */
  set(key: string, value: any, level: number): boolean {
    let matchLevel = this.matchLevel.get(key);
    if (matchLevel === undefined) {
      const defaultValue = this.default_core(key);
      this.addValue(key, defaultValue);
      return this.set(key, value, level);
    }
    if (matchLevel <= level) {
      this.matchLevel.set(key, level);
      this.matchedKey.set(key, true);
      this.matchValue.set(key, value);
      return true;
    }
    return false;
  }

  async apply(key?: string) {
    if (key !== undefined) {
      if (this.isMatched(key) && !this.isAcked(key)) {
        let value = this.getMatchValue(key);
        try {
          this.apply_core(key, value);
        } catch (error) {
          GFLog.error('Error on reset for key ' + key, error);
        }
        this.ack(key);
      } else if (this.isChanged(key) && !this.isAcked(key)) {
        this.reset(key);
        this.ack(key);
      }
    } else {
      this.keys.forEach((key) => {
        this.apply(key);
      });
    }
  }

  default_core(key: any): any {
    return null;
  }

  apply_core(key: any, value: any) {}

  isMatched(key?: string): boolean {
    if (key !== undefined) {
      return this.matchedKey.get(key) === true;
    }
    let matched = false;
    this.keys.forEach((key) => {
      matched = this.isMatched(key) || matched;
    });
    return matched;
  }

  isChanged(key?: string): boolean {
    if (key !== undefined) {
      return this.changedKey.get(key) === true;
    }
    let changed = false;
    this.keys.forEach((key) => {
      changed = this.isChanged(key) ? true : changed;
    });
    return changed;
  }

  getLevel(key?: string): number {
    if (key !== undefined) {
      let level = this.matchLevel.get(key);
      return level !== undefined ? level : GFState.DEFAULTLEVEL;
    }
    let level = GFState.DEFAULTLEVEL;
    this.keys.forEach((key) => (level = Math.max(this.getLevel(key))));
    return level;
  }

  unset(key?: string): this {
    if (key !== undefined) {
      this.matchValue.set(key, this.defaultValue.get(key));
      this.matchedKey.set(key, false);
      this.matchLevel.set(key, -1);
    } else {
      this.keys.forEach((key) => {
        this.unset(key);
      });
    }
    return this;
  }

  reset(key?: string): this {
    if (key !== undefined) {
      this.unset(key);
      let value = this.getDefaultValue(key);
      try {
        this.reset_core(key, value);
      } catch (error) {
        GFLog.error('Error on reset for key ' + key, error);
      }
      this.changedKey.set(key, false);
      this.matchedKey.set(key, false);
    } else {
      this.keys.forEach((key) => {
        this.reset(key);
      });
    }
    return this;
  }

  reset_core(key: any, value: any) {}

  prepare(): this {
    this.ackKey.clear();
    if (this.isChanged()) {
      this.unset();
    }
    return this;
  }
}

/**
 * Event SubState
 *
 * @class EventState
 * @extends {GFState}
 */
class EventState extends GFState {
  keys: gf.TTypeEventKeys[] = [];
  geo:
    | {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    | undefined = undefined;
  constructor(xgraph: XGraph, mxcell: mxCell) {
    super(xgraph, mxcell);
    this.init_core();
  }

  init_core() {
    // this.keys = $GF.CONSTANTS.EVENTMETHODS.map(x => x.value);
    this.geo = this.xcell.getDefaultDimension();
    // this.keys.forEach(key => {
    //   const value = this._get(key);
    //   this.addValue(key, value);
    // });
  }

  default_core(key: gf.TTypeEventKeys): any {
    return this._get(key);
  }

  apply_core(key: gf.TTypeEventKeys, value: any) {
    if (value === undefined) {
      value = null;
    }
    this._set(key, value);
  }

  reset_core(key: gf.TTypeEventKeys, value: any) {
    if (value === undefined) {
      value = null;
    }
    this._set(key, value);
  }

  _set(key: gf.TTypeEventKeys, value: any) {
    if (value === undefined || value === 'null') {
      value = null;
    }
    switch (key) {
      case 'class':
        throw new Error('Class not implemented');
        break;
      case 'text':
        value = String(value);
        this.xcell.setLabel(value);
        break;
      case 'tpMetadata':
        if (value !== null) {
          const tbl = String(value).split('@');
          if (tbl !== undefined && tbl.length > 0) {
            let k: any = tbl.shift();
            let v: any = null;
            if (tbl.length > 0) {
              v = tbl.join('@');
            }
            this.xcell.setMetadata(k, v);
          }
        }
        break;
      case 'tpText':
        if (value === undefined || value === null || value.length === 0 || value === 'null') {
          value = null;
        }
        this.xcell.setMetadata('tooltip', value);
        break;
      case 'visibility':
        value = String(value);
        if (value === '0') {
          this.xcell.hide();
        } else if (value === '1') {
          this.xcell.hide(false);
        }
        break;
      case 'fold':
        value = String(value);
        if (value === '0') {
          this.xcell.collapse(true);
        } else if (value === '1') {
          this.xcell.collapse(false);
        }
        break;

      case 'height':
        if (value !== undefined) {
          const height = Number(value);
          const width = this.getTargetValue('width');
          this.ack('width');
          this.xgraph.setAnimSizeCell(this.xcell, width, height);
        }
        break;

      case 'width':
        if (value !== undefined) {
          const width = Number(value);
          const height = this.getTargetValue('height');
          this.ack('height');
          this.xgraph.setAnimSizeCell(this.xcell, width, height);
        }
        break;

      case 'size':
        if (this.geo !== undefined) {
          let percent = Number(value);
          this.xgraph.setAnimZoomCell(this.xcell, percent);
        }
        break;

      case 'blink':
        if (!!value) {
          this.xcell.blink(value);
        } else {
          this.xcell.blink(value, false);
        }
        break;

      default:
        const k: any = key;
        if (XGraph.isMxGraphAnimStyle(key)) {
          let beginValue = this._get(k);
          beginValue = beginValue === undefined ? EventMap.getDefaultValue(k) : beginValue;
          this.xgraph.setAnimStyleCell(this.xcell, k, value, beginValue);
        } else if (XGraph.isMxGraphStyle(k)) {
          this.xcell.setStyle(k, value);
        } else {
          throw new Error(`Unknow type ${k}`);
        }
        break;
    }
  }

  _get(key: gf.TTypeEventKeys): any {
    switch (key) {
      case 'text':
        return this.xcell.getLabel();
        break;

      case 'visibility':
        // return this.xgraph.isVisibleCell(this.xcell) === false ? '0' : '1';
        return !this.xcell.isHidden;
        break;

      case 'height':
        return this.geo !== undefined ? this.geo.height : undefined;
        break;

      case 'width':
        return this.geo !== undefined ? this.geo.width : undefined;
        break;

      case 'tpText':
        return this.xcell.getMetadata('tooltip');
        break;

      case 'tpMetadata':
        // TODO
        return null;
        break;

      case 'size':
        return 100;
        break;

      case 'fold':
        return this.xcell.isCollapsed() === true ? '0' : '1';
        break;

      case 'blink':
        return this.xcell.isBlink;
        break;

      default:
        if (XGraph.isMxGraphStyle(key)) {
          const k: any = key;
          return this.xcell.getStyle(k);
        } else {
          throw new Error(`Unknow type ${key}`);
        }
        break;
    }
  }
}

class TextState extends GFState {
  // keys: string[] = ['label'];
  keys: string[] = [];
  constructor(xgraph: XGraph, mxcell: mxCell) {
    super(xgraph, mxcell);
    this.init_core();
  }

  init_core() {
    // const value = this.xgraph.getLabelCell(this.mxcell);
    // this.addValue('label', value);
  }

  default_core(key: any): string | null {
    return this.xcell.getLabel();
  }

  apply_core(key: string, value: any) {
    this.xcell.setLabel(value);
  }

  reset_core(key: string, value: any) {
    this.xcell.restoreLabel();
  }
}

class LinkState extends GFState {
  // keys: string[] = ['link'];
  keys: string[] = [];
  constructor(xgraph: XGraph, mxcell: mxCell) {
    super(xgraph, mxcell);
    this.init_core();
  }

  init_core() {
    // const value = this.xgraph.getLink(this.mxcell);
    // this.addValue('link', value);
  }

  default_core(key: any): string | null {
    return this.xcell.getDefaultLink();
  }

  apply_core(key: string, value: any) {
    this.xcell.setLink(value);
  }

  reset_core(key: string, value: any) {
    // if (value === undefined || value === null || value.length === 0) {
    //   this.xgraph.removeLink(this.xcell);
    // } else {
    //   this.xgraph.addLink(this.xcell, value);
    // }
    this.xcell.restoreLink();
  }
}

/**
 * State for shape color
 *
 * @class ShapeState
 * @extends {GFState}
 */
class ShapeState extends GFState {
  keys: gf.TStyleColorKeys[] = [];
  fullStylesString: string | undefined;
  constructor(xgraph: XGraph, xcell: XCell) {
    super(xgraph, xcell);
    this.init_core();
  }

  init_core() {
    // this.keys = $GF.CONSTANTS.COLORMETHODS.map(x => x.value);
    // this.fullStylesString = this.mxcell.getStyle();
    // this.keys.forEach(key => {
    //   const value = this.xgraph.getStyleCell(this.mxcell, key);
    //   this.addValue(key, value);
    //   GFLog.debug('ShapeState [' + this.mxcell.id + '] Add value : ' + key, value);
    // });
    // this.xcell.GF_tooltipHandler = null;
    this.xcell.enableTooltip(false);
  }

  default_core(key: any): string | null {
    return this.xcell.getDefaultStyle(key);
  }

  apply_core(key: gf.TStyleColorKeys, value: any) {
    if (value === undefined) {
      value = null;
    }
    this.xgraph.setAnimColorCell(this.xcell, key, value);
  }

  reset_core(key: gf.TStyleColorKeys, value: any) {
    // if (value === undefined) {
    //   value = null;
    // }
    // this.xgraph.setColorAnimCell(this.xcell, key, value);
    this.xcell.restoreStyle(key);
  }
}

class TooltipState extends GFState {
  keys: string[] = ['tooltip'];
  tooltipHandler: TooltipHandler | undefined;
  constructor(xgraph: XGraph, mxcell: mxCell) {
    super(xgraph, mxcell);
    this.init_core();
  }

  init_core() {
    this.addValue('tooltip', false);
    this.tooltipHandler = undefined;
    // this.xcell.GF_tooltipHandler = null;
    this.xcell.enableTooltip(false);
  }

  setTooltip(rule: Rule, metric: ObjectMetric, color: string, value: string, metadata: gf.TXCellMetadata) {
    let tpColor: string | null = null;
    let label: string = rule.data.tooltipLabel;
    if (this.tooltipHandler === null || this.tooltipHandler === undefined) {
      this.tooltipHandler = new TooltipHandler();
    }
    if (rule.data.tooltip) {
      if (label === null || label.length === 0) {
        if (rule.data.metricType === 'serie') {
          label = metric.getName();
        }
        if (rule.data.metricType === 'table') {
          label = rule.data.column;
        }
      }
      if (rule.data.tooltipColors) {
        tpColor = color;
      }
      // METRIC
      const metricToolip = this.tooltipHandler
        .addMetric()
        .setLabel(label)
        .setValue(value)
        .setColor(tpColor)
        .setDirection(rule.data.tpDirection);
      // GRAPH
      if (rule.data.tpGraph) {
        const graph = metricToolip.addGraph(rule.data.tpGraphType);
        graph
          .setColor(tpColor)
          .setColumn(rule.data.column)
          .setMetric(metric)
          .setSize(rule.data.tpGraphSize)
          .setScaling(rule.data.tpGraphLow, rule.data.tpGraphHigh)
          .setScale(rule.data.tpGraphScale);
      }
    }
    // Metadata
    if (rule.data.tpMetadata) {
      this.tooltipHandler.addMetadata().setXCell(this.xcell);
    }
    // Date
    this.tooltipHandler.updateDate();
  }

  async apply(key?: string) {
    if (key !== undefined && key === 'tooltip') {
      if (this.isMatched(key) && this.getMatchValue(key) === true) {
        if (this.tooltipHandler != null && this.tooltipHandler.isChecked()) {
          // this.xcell.GF_tooltipHandler = this.tooltipHandler;
          this.xcell.enableTooltip().setTooltipHandler(this.tooltipHandler);
        }
        super.apply(key);
      }
    } else {
      this.keys.forEach((key) => {
        this.apply(key);
      });
    }
  }

  prepare(): this {
    super.prepare();
    this.reset();
    return this;
  }

  reset(key?: string): this {
    if (key !== undefined && key === 'tooltip') {
      this.xcell.enableTooltip(false);
      // if (this.tooltipHandler) {
      //   this.tooltipHandler.destroy();
      // }
      this.tooltipHandler = undefined;
      super.reset(key);
    } else {
      this.keys.forEach((key) => {
        this.reset(key);
      });
    }
    return this;
  }
}

class IconState extends GFState {
  // keys: string[] = ['icon'];
  keys: string[] = [];
  constructor(xgraph: XGraph, mxcell: mxCell) {
    super(xgraph, mxcell);
    this.init();
  }

  init() {
    // this.addValue('icon', false);
  }

  default_core(key: string): any {
    return false;
  }

  apply_core(key?: string): this {
    if (key !== undefined && key === 'icon') {
      if (this.isMatched(key) && this.getMatchValue(key) === true) {
        if (!this.isChanged(key)) {
          // this.xgraph.addOverlay(`WARNING/ERROR`, this.xcell);
          this.xcell.addOverlay(`WARNING/ERROR`);
        }
        // super.apply(key);
      } else if (this.isChanged(key)) {
        this.reset_core(key);
      }
    } else {
      this.keys.forEach((key) => {
        this.apply_core(key);
      });
    }
    return this;
  }

  reset_core(key?: string): this {
    if (key !== undefined && key === 'icon') {
      // this.xgraph.removeOverlay(this.xcell);
      // super.reset(key);
      this.xcell.removeOverlay();
    } else {
      this.keys.forEach((key) => {
        this.reset_core(key);
      });
    }
    return this;
  }
}
