import grafana from './grafana_func';
import { State } from 'state_class';
import { isFinite as _isFinite, isArray as _isArray, escape as _escape } from 'lodash';
import { ObjectMetric } from 'metric_class';
import { $GF, GFLog } from 'globals_class';
import { NumberTH, StringTH, ObjectTH, ObjectTHData, DateTH } from 'threshold_class';
import {
  EventMap,
  ShapeMap,
  TextMap,
  LinkMap,
  ValueMap,
  RangeMap,
  ObjectMap,
  DataMap,
  ShapeMapArray,
} from 'mapping_class';
import { GFEvents } from 'flowcharting_base';
import { MetricHandler } from 'metric_handler';



// Signal definition
const ruleSignalsArray = ['rule_initalized', 'rule_updated', 'rule_changed', 'rule_freed'] as const;
type RuleSignals = typeof ruleSignalsArray[number];



/**
 * Rule definition
 *
 * @export
 * @class Rule
 */
export class Rule {
  data: gf.TIRuleData;
  initialized = false;
  metrics: Map<string, ObjectMetric> = new Map();
  completed = true;
  mapsObj: gf.TRuleMaps = {
    shapes: [],
    texts: [],
    links: [],
    events: [],
  };
  valueMaps: ValueMap[] = [];
  rangeMaps: RangeMap[] = [];
  numberTH: NumberTH[] = [];
  stringTH: StringTH[] = [];
  dateTH: DateTH[] = [];
  FE_metricName: string | undefined;
  uid: string;
  removeClick = 2;
  states: Map<string, State> = new Map();
  shapeStates: Map<string, State> = new Map();
  textStates: Map<string, State> = new Map();
  linkStates: Map<string, State> = new Map();
  eventStates: Map<string, State> = new Map();
  highestLevel = -1;
  highestColor = '';
  highestFormattedValue = '';
  highestValue: any = undefined;
  execTimes = 0;
  events: GFEvents<RuleSignals> = GFEvents.create(ruleSignalsArray);

  /**
   * Creates an instance of Rule.
   * @param {string} pattern
   * @param {TIRuleData} newData
   * @memberof Rule
   */
  constructor(pattern: string, newData: gf.TIRuleData, oldData?: any) {
    this.uid = $GF.genUid(this.constructor.name);
    this.data = newData;
    this.data.pattern = pattern;
    // this.ctrl = ctrl;
    if(oldData) {
      this._convert(oldData);
    }
    this.init();
    this.change();
  }
  //############################################################################
  //### INIT/UPDATE/CHANGE/FREE
  //############################################################################

  update() {
    this.initCycle();
    this.events.emit('rule_updated', this);
    return this;
  }

  init() {
    MetricHandler.events.connect('metric_created', this, this._on_metricHandler_metric_created.bind(this))
    MetricHandler.events.connect('metric_deleted', this, this._on_metricHandler_metric_deleted.bind(this))
    this.events.emit('rule_initalized', this);
    return this;
  }

  change() {
    // this.updateMetrics();
    // this.onChanged();
    // this.refresh();
    // this.updateStates();
    this.events.emit('rule_changed', this);
    return this;
  }

  async free() {
    await this.events.emit('rule_freed', this);
    MetricHandler.events.disconnect('metric_created', this);
    MetricHandler.events.disconnect('metric_deleted', this);
    this.events.clear();
    return this;
  }

  clear(): this {
    this.shapeStates.clear();
    this.textStates.clear();
    this.linkStates.clear();
    // TODO emit signal
    // this.states.forEach(state => {
    //   state._rules.delete(this.uid);
    // });
    return this;
  }

  //############################################################################
  //### CONVERT/MIGRATION
  //############################################################################
  /**
   * import data in rule
   *
   * @returns {this}
   * @param {data} obj
   * @memberof Rule
   */
   private _convert(obj: any): this {
    const trc = $GF.trace.before(this.constructor.name + '.' + 'import()');
    if (!!obj.unit) {
      this.data.unit = obj.unit;
    }
    if (!!obj.type) {
      this.data.type = obj.type;
    }
    if (!!obj.metricType) {
      this.data.metricType = obj.metricType;
    }
    if (!!obj.alias) {
      this.data.alias = obj.alias;
    }
    if (!!obj.refId) {
      this.data.refId = obj.refId;
    }
    if (!!obj.column) {
      this.data.column = obj.column;
    }
    if (!!obj.aggregation) {
      this.data.aggregation = obj.aggregation;
    }
    if (!!obj.decimals || obj.decimals === 0) {
      this.data.decimals = obj.decimals;
    }

    // Move to bellow since 0.9.1
    // if (!!obj.colors) {
    //   this.data.colors = obj.colors.slice(0);
    // }
    if (!!this.data.reduce) {
      this.data.reduce = true;
    }

    // 0.7.0
    let colorOn: gf.TColorOnKeys | undefined = undefined;
    if (!!obj.colorOn) {
      colorOn = obj.colorOn;
    }

    // 0.7.0
    let style: gf.TStyleColorKeys | undefined = undefined;
    if (!!obj.style) {
      style = obj.style;
    }

    // 0.7.0
    let link = false;
    let linkUrl: string | undefined = undefined;
    let linkParams: boolean | undefined = undefined;
    if (!!obj.link) {
      link = obj.link;
    }
    if (!!obj.linkUrl) {
      linkUrl = obj.linkUrl;
    }
    if (!!obj.linkParams) {
      linkParams = obj.linkParams;
    }

    // 0.7.0
    let linkOn: gf.TLinkOnKeys | undefined = undefined;
    if (!!obj.linkOn) {
      linkOn = obj.linkOn;
    }

    // 0.7.0
    let textOn: gf.TTextOnKeys | undefined = undefined;
    if (!!obj.textOn) {
      textOn = obj.textOn;
    }

    // 0.7.0
    let textReplace: gf.TTextMethodKeys | undefined = undefined;
    let textPattern: string | undefined = undefined;
    if (!!obj.textReplace) {
      textReplace = obj.textReplace;
    }
    if (!!obj.textPattern) {
      textPattern = obj.textPattern;
    }
    if (!!obj.pattern) {
      this.data.pattern = obj.pattern;
    }

    if (!!obj.dateColumn) {
      this.data.dateColumn = obj.dateColumn;
    }

    if (!!obj.dateFormat) {
      this.data.dateFormat = obj.dateFormat;
    }

    /******* BEGIN THRESHOLD NUMBER **********/
    this.data.numberTHData = [];
    this.numberTH = [];
    // if (this.data.type === 'number') {
    if (!!obj.thresholds && !!obj.colors) {
      let i = 0;
      let j = 0;
      obj.colors.forEach((cl: string | undefined) => {
        if (i === 0) {
          this._addNumberThreshold(i++, cl);
        } else {
          let th = obj.thresholds[j++];
          if (typeof th === 'string' && th.length > 0) {
            th = parseFloat(th);
          }
          this._addNumberThreshold(i++, cl, th);
        }
      });
    } else {
      if (!!obj.numberTHData) {
        // this.data.numberTHData = [];
        // this.numberTH = [];
        let th: gf.TTHNumberData[] = obj.numberTHData;
        if (th !== undefined && th != null && th.length > 0) {
          th.forEach((thdata: gf.TTHNumberData) => {
            this._addNumberThreshold().import(thdata);
          });
        }
      }
    }
    // }

    if (this.numberTH.length === 0) {
      this._addNumberThreshold(0, 'rgba(245, 54, 54, 0.9)', 0);
      this._addNumberThreshold(1, 'rgba(237, 129, 40, 0.89)', 50);
      this._addNumberThreshold(2, 'rgba(50, 172, 45, 0.97)', 80);
    }
    /******* END THRESHOLD NUMBER **********/

    /******* BEGIN THRESHOLD STRING **********/
    let stringTH: any = [];
    this.data.stringTHData = [];
    this.stringTH = [];
    if (!!obj.stringThresholds) {
      stringTH = obj.stringThresholds.slice(0);
    }
    if (!!obj.stringWarning) {
      stringTH[1] = obj.stringWarning;
    }
    if (!!obj.stringCritical) {
      stringTH[0] = obj.stringCritical;
    }
    // if (this.data.type === 'string') {
    if (!!stringTH && obj.colors) {
      let i = 0;
      let j = 0;
      obj.colors.forEach((cl: string | undefined) => {
        if (i === 0) {
          this._addStringThreshold(i++, cl);
        } else {
          let th = stringTH[j++];
          if (typeof th === 'number') {
            th = th.toString();
          }
          this._addStringThreshold(i++, cl, th);
        }
      });
    } else {
      if (!!obj.stringTHData) {
        // this.data.stringTHData = [];
        // this.stringTH = [];
        let th: gf.TTHStringData[] = obj.stringTHData;
        if (th !== undefined && th != null && th.length > 0) {
          th.forEach((thdata: gf.TTHStringData) => {
            this._addStringThreshold().import(thdata);
          });
        }
      }
    }
    // }

    if (this.stringTH.length === 0) {
      this._addStringThreshold(0, 'rgba(245, 54, 54, 0.9)', '/.*/');
      this._addStringThreshold(1, 'rgba(237, 129, 40, 0.89)', '/.*warning.*/');
      this._addStringThreshold(2, 'rgba(50, 172, 45, 0.97)', '/.*(success|ok).*/');
    }
    /******* END THRESHOLD STRING **********/

    /******* BEGIN THRESHOLD DATE **********/
    if (this.dateTH.length === 0) {
      this._addDateThreshold(0, 'rgba(245, 54, 54, 0.9)', '0d');
      this._addDateThreshold(1, 'rgba(237, 129, 40, 0.89)', '-1d');
      this._addDateThreshold(2, 'rgba(50, 172, 45, 0.97)', '-1w');
    }
    /******* END THRESHOLD DATE **********/

    if (!!obj.invert || obj.invert === false) {
      this.data.invert = obj.invert;
    }

    if (!!obj.gradient || obj.gradient === false) {
      this.data.gradient = obj.gradient;
    }

    if (!!obj.overlayIcon || obj.overlayIcon === false) {
      this.data.overlayIcon = obj.overlayIcon;
    }
    if (!!obj.tooltip || obj.tooltip === false) {
      this.data.tooltip = obj.tooltip;
    }
    if (!!obj.tooltipLabel) {
      this.data.tooltipLabel = obj.tooltipLabel;
    }
    if (!!obj.tooltipColors || obj.tooltipColors === false) {
      this.data.tooltipColors = obj.tooltipColors;
    }
    if (!!obj.tooltipOn) {
      this.data.tooltipOn = obj.tooltipOn;
    }
    if (!!obj.tpDirection) {
      this.data.tpDirection = obj.tpDirection;
    }
    if (!!obj.tpMetadata) {
      this.data.tpMetadata = obj.tpMetadata;
    }
    if (!!obj.tpGraph || this.data.tpGraph === false) {
      this.data.tpGraph = obj.tpGraph;
    }
    if (!!obj.tpGraphSize) {
      this.data.tpGraphSize = obj.tpGraphSize;
    }
    if (!!obj.tpGraphType) {
      this.data.tpGraphType = obj.tpGraphType;
    }
    if (!!obj.tpGraphLow || obj.tpGraphLow === 0) {
      this.data.tpGraphLow = obj.tpGraphLow;
    }
    if (!!obj.tpGraphHigh || obj.tpGraphHigh === 0) {
      this.data.tpGraphHigh = obj.tpGraphHigh;
    }
    if (!!obj.tpGraphScale) {
      this.data.tpGraphScale = obj.tpGraphScale;
    }
    let maps: any = [];

    // SHAPES
    // <= 0.9.0
    if (!!obj.shapeProp) {
      this.data.mapsDat.shapes.options.identByProp = obj.shapeProp;
    }
    if (!!obj.shapeRegEx || obj.shapeRegEx === false) {
      this.data.mapsDat.shapes.options.enableRegEx = obj.shapeRegEx;
    }

    // 1.0.0
    if (!!obj.mapsDat) {
      if (!!obj.mapsDat.shapes) {
        this.data.mapsDat.shapes.options.identByProp =
          obj.mapsDat.shapes.options.identByProp !== undefined
            ? obj.mapsDat.shapes.options.identByProp
            : this.data.mapsDat.shapes.options.identByProp;
        this.data.mapsDat.shapes.options.enableRegEx = obj.mapsDat.shapes.options.enableRegEx;
        this.data.mapsDat.shapes.options.metadata = obj.mapsDat.shapes.options.metadata;
      }
    }

    maps = [];
    this.data.mapsDat.shapes.dataList = [];
    if (obj.shapeMaps !== undefined && obj.shapeMaps !== null) {
      // For 0.2.0
      maps = obj.shapeMaps;
    } else {
      // < 0.9.0
      if (obj.shapeData !== undefined && obj.shapeData !== null) {
        maps = obj.shapeData;
      } else {
        // 1.0.0
        maps = obj.mapsDat.shapes.dataList;
      }
    }

    if (maps !== undefined && maps !== null && maps.length > 0) {
      maps.forEach((shapeData: gf.TShapeMapData) => {
        // 0.7.0
        if (!!style) {
          shapeData.style = style;
        }

        // 0.7.0
        if (!!colorOn) {
          shapeData.colorOn = colorOn;
        }
        this.addShapeMap().import(shapeData);
      });
    }

    // TEXT
    if (!!obj.textProp) {
      this.data.mapsDat.texts.options.identByProp = obj.textProp;
    }

    if (!!obj.textRegEx || obj.textRegEx === false) {
      this.data.mapsDat.texts.options.enableRegEx = obj.textRegEx;
    }

    if (!!obj.mapsDat) {
      if (!!obj.mapsDat.texts) {
        this.data.mapsDat.texts.options.identByProp =
          obj.mapsDat.texts.options.identByProp !== undefined
            ? obj.mapsDat.texts.options.identByProp
            : this.data.mapsDat.texts.options.identByProp;
        this.data.mapsDat.texts.options.enableRegEx = obj.mapsDat.texts.options.enableRegEx;
        this.data.mapsDat.texts.options.metadata = obj.mapsDat.texts.options.metadata;
      }
    }

    maps = [];
    this.data.mapsDat.texts.dataList = [];
    if (obj.textMaps !== undefined && obj.textMaps !== null) {
      // For 0.2.0
      maps = obj.textMaps;
    } else {
      // 0.9.1
      if (obj.textData !== undefined && obj.textData !== null) {
        maps = obj.textData;
      } else {
        maps = obj.mapsDat.texts.dataList;
      }
    }

    if (maps !== undefined && maps != null && maps.length > 0) {
      maps.forEach((textData: gf.TTextMapData) => {
        // 0.7.0
        if (!!textReplace) {
          textData.textReplace = textReplace;
        }
        if (!!textPattern) {
          textData.textPattern = textPattern;
        }
        if (!!textOn) {
          textData.textOn = textOn;
        }

        this.addTextMap().import(textData);
      });
    }

    // LINK
    if (!!obj.linkProp) {
      this.data.mapsDat.links.options.identByProp = obj.linkProp;
    }

    if (!!obj.linkRegEx || obj.linkRegEx === false) {
      this.data.mapsDat.links.options.enableRegEx = obj.linkRegEx;
    }

    if (!!obj.mapsDat) {
      if (!!obj.mapsDat.links) {
        this.data.mapsDat.links.options.identByProp =
          obj.mapsDat.links.options.identByProp !== undefined
            ? obj.mapsDat.links.options.identByProp
            : this.data.mapsDat.links.options.identByProp;
        this.data.mapsDat.links.options.enableRegEx = obj.mapsDat.links.options.enableRegEx;
        this.data.mapsDat.links.options.metadata = obj.mapsDat.links.options.metadata;
      }
    }

    this.data.mapsDat.links.dataList = [];
    maps = [];
    if (obj.linkMaps !== undefined && obj.linkMaps !== null) {
      // For 0.2.0
      maps = obj.linkMaps;
    } else {
      // 0.9.1
      if (obj.linkData !== undefined && obj.linkData !== null) {
        maps = obj.linkData;
      } else {
        maps = obj.mapsDat.links.dataList;
      }
    }

    if (maps.length > 0) {
      maps.forEach((linkData: gf.TlinkMapData) => {
        // 0.7.0
        if (!!linkUrl && link) {
          linkData.linkUrl = linkUrl;
        }
        if (!!linkParams && link) {
          linkData.linkParams = linkParams;
        }
        if (!!linkOn) {
          linkData.linkOn = linkOn;
        }
        this.addLinkMap().import(linkData);
      });
    }

    // EVENT
    // <= 0.9.0
    if (!!obj.eventProp) {
      this.data.mapsDat.events.options.identByProp = obj.eventProp;
    }
    if (!!obj.eventRegEx || obj.eventRegEx === false) {
      this.data.mapsDat.events.options.enableRegEx = obj.eventRegEx;
    }

    // 1.0.0
    if (!!obj.mapsDat) {
      if (!!obj.mapsDat.events) {
        this.data.mapsDat.events.options.identByProp =
          obj.mapsDat.events.options.identByProp !== undefined
            ? obj.mapsDat.events.options.identByProp
            : this.data.mapsDat.events.options.identByProp;
        this.data.mapsDat.events.options.enableRegEx = obj.mapsDat.events.options.enableRegEx;
        this.data.mapsDat.events.options.metadata = obj.mapsDat.events.options.metadata;
      }
    }

    this.data.mapsDat.events.dataList = [];
    maps = [];
    if (obj.eventData !== undefined && obj.eventData != null) {
      maps = obj.eventData;
    }
    if (obj.eventsMap !== undefined && obj.eventsMap !== null) {
      maps = obj.eventsMap.dataList;
    }
    if (obj.mapsDat && obj.mapsDat.events && obj.mapsDat.events.dataList) {
      maps = obj.mapsDat.events.dataList;
    }

    if (maps !== undefined && maps != null && maps.length > 0) {
      maps.forEach((eventData: gf.TEventMapData) => {
        this.addEventMap().import(eventData);
      });
    }

    this.data.mappingType = obj.mappingType || 1;

    // VALUES
    this.data.valueData = [];
    if (obj.valueData !== undefined && obj.valueData != null && obj.valueData.length > 0) {
      obj.valueData.forEach((valueData: gf.TValueMapData) => {
        this.addValueMap('value', 'text').import(valueData);
      });
    }

    // RANGE
    this.data.rangeData = [];
    if (obj.rangeData !== undefined && obj.rangeData != null && obj.rangeData.length > 0) {
      obj.rangeData.forEach((rangeData: any) => {
        this.addRangeMap('from', 'to', 'text').import(rangeData);
      });
    }
    this.data.sanitize = obj.sanitize || false;
    this.data.newRule = false;
    trc.after();
    return this;
  }


  //############################################################################
  //### LOGIC
  //############################################################################

  getMetrics(): Map<string, ObjectMetric> {
    return this.metrics;
  }

  /**
   * Get default data
   *
   * @static
   * @returns {gf.TIRuleData}
   * @memberof Rule
   */
  static getDefaultData(): gf.TIRuleData {
    return {
      order: 1,
      pattern: '.*',
      unit: 'short',
      type: 'number',
      metricType: 'serie',
      alias: 'myRule',
      refId: 'A',
      column: 'Time',
      hidden: false,
      aggregation: 'current',
      decimals: 2,
      // colors: ['rgba(245, 54, 54, 0.9)', 'rgba(237, 129, 40, 0.89)', 'rgba(50, 172, 45, 0.97)'],
      reduce: true,
      dateColumn: 'Time',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
      // thresholds: [50, 80],
      // stringThresholds: ['/.*/', '/.*/'],
      numberTHData: [],
      stringTHData: [],
      dateTHData: [],
      invert: false,
      gradient: false,
      overlayIcon: false,
      tooltip: false,
      tooltipLabel: '',
      tooltipColors: false,
      tooltipOn: 'a',
      tpDirection: 'v',
      tpMetadata: false,
      tpGraph: false,
      tpGraphSize: '100%',
      tpGraphType: 'line',
      tpGraphLow: null,
      tpGraphHigh: null,
      tpGraphScale: 'linear',
      mapsDat: {
        shapes: {
          options: Rule.getDefaultMapOptions(),
          dataList: [],
        },
        texts: {
          options: Rule.getDefaultMapOptions(),
          dataList: [],
        },
        links: {
          options: Rule.getDefaultMapOptions(),
          dataList: [],
        },
        events: {
          options: Rule.getDefaultMapOptions(),
          dataList: [],
        },
      },
      mappingType: 1,
      valueData: [],
      rangeData: [],
      sanitize: false,
      newRule: true,
    };
  }

  static getDefaultMapOptions(): gf.TRuleMapOptions {
    return {
      identByProp: 'id',
      metadata: '',
      enableRegEx: true,
    };
  }

  /**
   * return data of rule
   *
   * @returns {data}
   * @memberof Rule
   */
  getData(): gf.TIRuleData {
    return this.data;
  }



  /**
   * Return uniq id of rule
   *
   * @returns
   * @memberof Rule
   */
  // .id: string {
  //   return this.id;
  // }

  /**
   * Highlight Cells in rule (mapping color text and link)
   *
   * @memberof Rule
   */
  highlightXCells() {
    if (this.states) {
      this.states.forEach(state => {
        state.highlightCell();
      });
    }
  }

  /**
   * Highlight Cells in rule (mapping color text and link)
   *
   * @memberof Rule
   */
  unhighlightXCells() {
    if (this.states) {
      this.states.forEach(state => {
        state.unhighlightCell();
      });
    }
  }

  /**
   * Return the order of this rule
   * Grafana 6+ have a bug when reload dashboad, array are not in order
   *
   * @param {number} order
   * @memberof Rule
   */
  setOrder(order: number): this {
    this.data.order = order;
    return this;
  }

  /**
   * Return order of rule
   *
   * @memberof Rule
   */
  getOrder(): number {
    return this.data.order;
  }

  isHidden(): boolean {
    return this.data.hidden;
  }

  hide(): this {
    this.data.hidden = true;
    return this;
  }

  show(): this {
    this.data.hidden = false;
    return this;
  }

  /**
   * Invert color order
   *
   * @returns {this}
   * @memberof Rule
   */
  _invertColorOrder(): this {
    // this.data.colors.reverse();
    this._invertColorOrderFor(this.numberTH);
    this._invertColorOrderFor(this.stringTH);
    this._invertColorOrderFor(this.dateTH);
    return this;
  }

  _invertColorOrderFor(ths: ObjectTH[]): this {
    const colors: string[] = [];
    ths.forEach(th => {
      colors.push(th.getColor());
    });
    colors.reverse();
    let i = 0;
    ths.forEach(TH => {
      TH.setColor(colors[i++]);
    });
    return this;
  }

  /**
   * Invert threshold
   *
   * @returns {this}
   * @memberof Rule
   */
  invertThesholds(): this {
    this._invertColorOrder();
    this.data.invert = !this.data.invert;
    return this;
  }

  /**
   * Invert threshold
   *
   * @returns {this}
   * @memberof Rule
   */
  invertThesholdsColors(): this {
    this._invertColorOrder();
    // this.data.invert = !this.data.invert;
    return this;
  }

  /**
   * Add a new threshold at the position index, if index is undefined, add to the end.
   *
   * @param {number} index
   * @returns {this}
   * @memberof Rule
   */
  addThreshold(index?: number, color?: string, value?: any): ObjectTH {
    switch (this.data.type) {
      case 'number':
        return this._addNumberThreshold(index, color, value);
        break;
      case 'string':
        return this._addStringThreshold(index, color, value);
        break;
      case 'date':
        return this._addDateThreshold(index, color, value);
        break;
      default:
        throw new Error('Type of threshold unknown : ' + this.data.type);
        break;
    }
  }

  /**
   * Return a Threshold class
   *
   * @param {number} index
   * @returns {ObjectTH}
   * @memberof Rule
   */
  getThreshold(index: number): ObjectTH {
    switch (this.data.type) {
      case 'number':
        return this.numberTH[index];
        break;
      case 'string':
        return this.stringTH[index];
        break;
      case 'date':
        return this.dateTH[index];
        break;
      default:
        throw new Error('Type of threshold unknown : ' + this.data.type);
        break;
    }
  }

  cloneThreshold(index: number): ObjectTH {
    const refth = this.getThreshold(index);
    if (refth !== undefined) {
      return this.addThreshold(index).import(refth.getData());
    }
    return refth;
  }

  _addNumberThreshold(index?: number, color?: string, value?: number): NumberTH {
    const thfTable = this.numberTH;
    const thdTable = this.data.numberTHData;
    let finalColor = color;
    let finalValue = value;
    const data = NumberTH.getDefaultData();
    const nth = new NumberTH(data.color, data.value, data.comparator, data);
    const length = thdTable.length;
    if (index === undefined || length === 0) {
      index = length;
    }
    if (index > length - 1) {
      index = length - 1;
    }
    let ref = index;
    if (index === 0 && length > 1) {
      ref = 1;
    }

    if (length > 0) {
      const lth = thfTable[ref];
      nth.import(lth.getData());
      const ratio = 0.5;
      // Color
      if (finalColor === undefined) {
        let beginColor = lth.getColor();
        if (ref < length - 1 && index !== 0) {
          const endColor = thfTable[ref + 1].getColor();
          finalColor = $GF.calculateColorForRatio(beginColor, endColor, ratio);
        } else {
          finalColor = beginColor;
        }
        if (finalColor !== undefined) {
        }
      }
      // Value
      if (finalValue === undefined) {
        let beginValue = lth.getValue();
        if (ref < length - 1 && index !== 0) {
          const endValue = thfTable[ref + 1].getValue();
          finalValue = $GF.calculateValueForRatio(beginValue, endValue, ratio);
        } else {
          finalValue = beginValue;
        }
      }
    }
    if (finalColor !== undefined) {
      nth.setColor(finalColor);
    }
    if (finalValue !== undefined) {
      nth.setValue(finalValue);
    }
    thfTable.splice(index + 1, 0, nth);
    thdTable.splice(index + 1, 0, data);
    return nth;
  }

  _addStringThreshold(index?: number, color?: string, value?: string): StringTH {
    const thfTable = this.stringTH;
    const thdTable = this.data.stringTHData;
    let finalColor = color;
    let finalValue = value;
    const data = StringTH.getDefaultData();
    const nth = new StringTH(data.color, data.value, data.comparator, data);
    const length = thdTable.length;
    if (index === undefined || length === 0) {
      index = length;
    }
    if (index > length - 1) {
      index = length - 1;
    }
    let ref = index;
    if (index === 0 && length > 1) {
      ref = 1;
    }

    if (length > 0) {
      const lth = thfTable[ref];
      nth.import(lth.getData());
      const ratio = 0.5;
      // Color
      if (finalColor === undefined) {
        let beginColor = lth.getColor();
        if (ref < length - 1 && index !== 0) {
          const endColor = thfTable[ref + 1].getColor();
          finalColor = $GF.calculateColorForRatio(beginColor, endColor, ratio);
        } else {
          finalColor = beginColor;
        }
        if (finalColor !== undefined) {
        }
      }
      // Value
      if (finalValue === undefined) {
        finalValue = lth.getValue();
      }
    }
    if (finalColor !== undefined) {
      nth.setColor(finalColor);
    }
    if (finalValue !== undefined) {
      nth.setValue(finalValue);
    }
    thfTable.splice(index + 1, 0, nth);
    thdTable.splice(index + 1, 0, data);
    return nth;
  }

  _addDateThreshold(index?: number, color?: string, value?: string): DateTH {
    const thfTable = this.dateTH;
    const thdTable = this.data.dateTHData;
    let finalColor = color;
    let finalValue = value;
    const data = DateTH.getDefaultData();
    const nth = new DateTH(data.color, data.value, data.comparator, data);
    const length = thdTable.length;
    if (index === undefined || length === 0) {
      index = length;
    }
    if (index > length - 1) {
      index = length - 1;
    }
    let ref = index;
    if (index === 0 && length > 1) {
      ref = 1;
    }

    if (length > 0) {
      const lth = thfTable[ref];
      nth.import(lth.getData());
      const ratio = 0.5;
      // Color
      if (finalColor === undefined) {
        let beginColor = lth.getColor();
        if (ref < length - 1 && index !== 0) {
          const endColor = thfTable[ref + 1].getColor();
          finalColor = $GF.calculateColorForRatio(beginColor, endColor, ratio);
        } else {
          finalColor = beginColor;
        }
        if (finalColor !== undefined) {
        }
      }
      // Value
      if (finalValue === undefined) {
        finalValue = lth.getValue();
      }
    }
    if (finalColor !== undefined) {
      nth.setColor(finalColor);
    }
    if (finalValue !== undefined) {
      nth.setValue(finalValue);
    }
    thfTable.splice(index + 1, 0, nth);
    thdTable.splice(index + 1, 0, data);
    return nth;
  }

  /**
   *
   *
   * @param {number} index
   * @returns {this}
   * @memberof Rule
   */
  removeThreshold(index: number): this {
    const ths = this.getThresholds();
    const thd = this.getThresholdDatas();
    ths.splice(index, 1);
    thd.splice(index, 1);
    return this;
  }

  /**
   * Return Thresholds Array
   *
   * @returns {string[]}
   * @memberof Rule
   */

  getThresholds(): ObjectTH[] {
    switch (this.data.type) {
      case 'number':
        return this.numberTH;
        break;
      case 'string':
        return this.stringTH;
        break;
      case 'date':
        return this.dateTH;
        break;
      default:
        throw new Error('Type of threshold unknown : ' + this.data.type);
        break;
    }
  }

  clearThresholds(): this {
    this._clearNumberThresholds();
    this._clearStringThresholds();
    this._clearDateThresholds();
    return this;
  }

  initThresholds(): this {
    // this.clearThresholds();
    this._initNumberThresholds();
    this._initStringThresholds();
    this._initDateThresholds();
    return this;
  }

  private _clearNumberThresholds(): this {
    this.data.numberTHData = [];
    this.numberTH = [];
    return this;
  }

  private _initNumberThresholds(): this {
    this._clearNumberThresholds();
    this._addNumberThreshold(0, 'rgba(245, 54, 54, 0.9)', 0);
    this._addNumberThreshold(1, 'rgba(237, 129, 40, 0.89)', 50);
    this._addNumberThreshold(2, 'rgba(50, 172, 45, 0.97)', 80);
    return this;
  }

  private _clearStringThresholds(): this {
    this.data.stringTHData = [];
    this.stringTH = [];
    return this;
  }

  private _initStringThresholds(): this {
    this._clearStringThresholds();
    this._addStringThreshold(0, 'rgba(245, 54, 54, 0.9)', '/.*/');
    this._addStringThreshold(1, 'rgba(237, 129, 40, 0.89)', '/.*warning.*/');
    this._addStringThreshold(2, 'rgba(50, 172, 45, 0.97)', '/.*(success|ok).*/');
    return this;
  }

  private _clearDateThresholds(): this {
    this.data.dateTHData = [];
    this.dateTH = [];
    return this;
  }

  private _initDateThresholds(): this {
    this._clearDateThresholds();
    this._addDateThreshold(0, 'rgba(245, 54, 54, 0.9)', '0d');
    this._addDateThreshold(1, 'rgba(237, 129, 40, 0.89)', '-1d');
    this._addDateThreshold(2, 'rgba(50, 172, 45, 0.97)', '-1w');
    return this;
  }

  /**
   * Return data threshold array
   *
   * @returns {string[]}
   * @memberof Rule
   */

  getThresholdDatas(): ObjectTHData[] {
    switch (this.data.type) {
      case 'number':
        return this.data.numberTHData;
        break;
      case 'string':
        return this.data.stringTHData;
        break;
      case 'date':
        return this.data.dateTHData;
        break;
      default:
        throw new Error('Type of threshold unknown : ' + this.data.type);
        break;
    }
  }

  /**
   * Return number of colors
   *
   * @returns {number}
   * @memberof Rule
   */
  // getColorsCount(): number {
  //   return this.data.colors.length;
  // }
  getThresholdCount(): number {
    return this.getThresholds().length;
  }

  //
  // Conditions
  //

  /**
   * Return true or false for condition to display icon warning
   *
   * @param {level} level
   * @returns {boolean}
   * @memberof Rule
   */
  toIconize(level: number): boolean {
    if (this.data.overlayIcon === false) {
      return false;
    }
    if (this.data.overlayIcon === true && level >= 1) {
      return true;
    }
    return false;
  }

  /**
   * Return true or false for condition to display tooltip with values
   *
   * @param {number} level
   * @returns
   * @memberof Rule
   */
  toTooltipize(level: number): boolean {
    if (this.data.tooltip === false && this.data.tpMetadata === false) {
      return false;
    }
    if (this.data.tooltipOn === 'a') {
      return true;
    }
    if (this.data.tooltipOn === 'wc' && level >= 1) {
      return true;
    }
    return false;
  }

  /**
   * Return if state is matched
   *
   * @param {State} state
   * @returns {boolean}
   * @memberof Rule
   */
  MatchState(state: State): boolean {
    const xcell = state.getXCell();
    let mapOptions = this.getShapeMapOptions();
    let value = xcell.getDefaultValues(mapOptions);
    if (this.matchShape(value, mapOptions)) {
      return true;
    }
    mapOptions = this.getTextMapOptions();
    value = xcell.getDefaultValues(mapOptions);
    if (this.matchText(value, mapOptions)) {
      return true;
    }
    mapOptions = this.getLinkMapOptions();
    value = xcell.getDefaultValues(mapOptions);
    if (this.matchLink(value, mapOptions)) {
      return true;
    }
    mapOptions = this.getEventMapOptions();
    value = xcell.getDefaultValues(mapOptions);
    if (this.matchEvent(value, mapOptions)) {
      return true;
    }
    return false;
  }

  //
  // Private methods maps
  //
  _matchMaps(
    type: gf.TTypeMap,
    pattern: string | null,
    options: gf.TRuleMapOptions = this._getMapsOptions(type)
  ): boolean {
    const maps = this._getMapsObjType(type);
    let found = false;
    const length = maps.length;
    for (let index = 0; index < length; index++) {
      const map = maps[index];
      found = map.match(pattern, options);
      if (found) {
        break;
      }
    }
    return found;
  }

  _getMapsDat() {
    return this.data.mapsDat;
  }

  _getRuleMapsData(type: gf.TTypeMap): gf.TRuleMapData {
    return this._getMapsDat()[`${type}s`];
  }

  _getMapsObj() {
    return this.mapsObj;
  }

  _getMapsObjType(type: gf.TTypeMap): ObjectMap[] {
    return this._getMapsObj()[`${type}s`];
  }

  _getMapsDatList(type: gf.TTypeMap): DataMap[] {
    return this._getRuleMapsData(type).dataList;
  }

  _getMapsOptions(type: gf.TTypeMap): gf.TRuleMapOptions {
    return this._getRuleMapsData(type).options;
  }

  _addMaps(map: ObjectMap) {
    const maps = this._getMapsObjType(map.getType());
    const datas = this._getMapsDatList(map.getType());
    maps.push(map);
    datas.push(map.getData());
  }

  _removeMaps(index: number, type: gf.TTypeMap) {
    const maps = this._getMapsObjType(type);
    const datas = this._getMapsDatList(type);
    maps.splice(index, 1);
    datas.splice(index, 1);
  }

  //
  // SHAPE MAPS
  //
  /**
   * Add new shape for rule
   *
   * @param {string} pattern
   * @memberof Rule
   */
  addShapeMap(pattern = ''): ShapeMap {
    const data = ShapeMap.getDefaultData();
    const m = new ShapeMap(pattern, data);
    m.setOptions(this.getShapeMapOptions());
    this._addMaps(m);
    return m;
  }

  /**
   * Duplicate shapeMap
   *
   * @param {ShapeMap} initial
   * @returns {ShapeMap}
   * @memberof Rule
   */
  cloneShapeMap(initial: ShapeMap): ShapeMap {
    return this.addShapeMap().import(initial);
  }

  /**
   * Remove shape for rule
   *
   * @returns {this}
   * @param {number} index
   * @memberof Rule
   */
  removeShapeMap(index: number): this {
    this._removeMaps(index, 'shape');
    return this;
  }

  getShapeMapOptions(): gf.TRuleMapOptions {
    return this._getMapsOptions('shape');
  }

  /**
   * Return shape objet in index position
   *
   * @param {number} index
   * @returns {ShapeMap}
   * @memberof Rule
   */
  getShapeMap(index: number): ShapeMap {
    const maps = this._getMapsObjType('shape');
    const map = maps[index];
    if (map instanceof ShapeMap) {
      return map;
    } else {
      throw new Error('map is not an instance of ShapeMap');
    }
  }

  /**
   * Return all ShapeMaps
   *
   * @returns {Array<ShapeMap>}
   * @memberof Rule
   */
  getShapeMaps(): ShapeMapArray {
    // const maps = this._getObjectListMap('shape');
    const maps = this._getMapsObj()['shapes'];
    return maps;
  }

  /**
   * Return bool if shape name (value|id) is in rule
   *
   * @param {string} pattern
   * @returns {boolean}
   * @memberof Rule
   */
  matchShape(pattern: string | null, options: gf.TRuleMapOptions = this.getShapeMapOptions()): boolean {
    return this._matchMaps('shape', pattern, options);
  }

  //
  // TEXT MAPS
  //
  addTextMap(pattern = ''): TextMap {
    const data = TextMap.getDefaultData();
    const m = new TextMap(pattern, data);
    m.setOptions(this.getTextMapOptions());
    this._addMaps(m);
    return m;
  }

  /**
   * Duplicate and add textMap
   *
   * @param {ShapeMap} initial
   * @returns {ShapeMap}
   * @memberof Rule
   */
  cloneTextMap(initial: TextMap): TextMap {
    return this.addTextMap().import(initial);
  }

  /**
   * Remove TextMap
   *
   * @param {number} index
   * @memberof Rule
   */
  removeTextMap(index: number) {
    this._removeMaps(index, 'text');
    return this;
  }

  getTextMapOptions(): gf.TRuleMapOptions {
    return this._getMapsOptions('text');
  }

  /**
   * Get a TextMap at position
   *
   * @param {number} index
   * @returns {TextMap}
   * @memberof Rule
   */
  getTextMap(index: number): TextMap {
    const maps = this._getMapsObjType('text');
    const map = maps[index];
    if (map instanceof TextMap) {
      return map;
    } else {
      throw new Error('map is not an instance of TextMap');
    }
  }

  /**
   * Get TextMaps as array
   *
   * @returns {TextMap[]}
   * @memberof Rule
   */
  getTextMaps(): TextMap[] {
    // return <TextMap[]> this._getMapsObjType('text');
    const maps = this._getMapsObj()['texts'];
    return maps;
  }

  /**
   * Match pattern
   *
   * @param {(string | null)} pattern
   * @returns {boolean}
   * @memberof Rule
   */
  matchText(pattern: string | null, options: gf.TRuleMapOptions = this.getTextMapOptions()): boolean {
    return this._matchMaps('text', pattern, options);
  }

  /**
   * Add an Event Map
   *
   * @param {string}
   * @returns {EventMap}
   * @memberof Rule
   */
  addEventMap(pattern = ''): EventMap {
    const data = EventMap.getDefaultData();
    const m = new EventMap(pattern, data);
    m.setOptions(this.getEventMapOptions());
    this._addMaps(m);
    return m;
  }

  /**
   * Clone an evenMap
   *
   * @param {EventMap} map
   * @returns {EventMap}
   * @memberof Rule
   */
  cloneEventMap(map: EventMap): EventMap {
    return this.addEventMap().import(map.getData());
  }

  removeEventMap(index: number): this {
    this._removeMaps(index, 'event');
    return this;
  }

  getEventMapOptions(): gf.TRuleMapOptions {
    return this._getMapsOptions('event');
  }

  getEventMap(index: number): EventMap {
    const maps = this._getMapsObjType('event');
    const map = maps[index];
    if (map instanceof EventMap) {
      return map;
    } else {
      throw new Error('map is not an instance of EventMap');
    }
  }

  getEventMaps(): EventMap[] {
    // return <EventMap[]> this._getMapsObjType('event');
    const maps = this._getMapsObj()['events'];
    return maps;
  }

  matchEvent(pattern: string | null, options: gf.TRuleMapOptions = this.getEventMapOptions()): boolean {
    return this._matchMaps('event', pattern, options);
  }

  //
  // LINK MAPS
  //
  addLinkMap(pattern = ''): LinkMap {
    const data = LinkMap.getDefaultData();
    const m = new LinkMap(pattern, data);
    m.setOptions(this.getLinkMapOptions());
    // m.import(data);
    this._addMaps(m);
    return m;
  }

  /**
   * Duplicate linkMap
   *
   * @param {LinkMap} initial
   * @returns {LinkMap}
   * @memberof Rule
   */
  cloneLinkMap(initial: LinkMap): LinkMap {
    return this.addLinkMap().import(initial);
  }

  /**
   * Remove a linkmap at position
   *
   * @param {number} index
   * @memberof Rule
   */
  removeLinkMap(index: number): this {
    this._removeMaps(index, 'link');
    return this;
  }

  getLinkMapOptions(): gf.TRuleMapOptions {
    return this._getMapsOptions('link');
  }

  /**
   * Get LinkMap at position
   *
   * @param {number} index
   * @returns {LinkMap}
   * @memberof Rule
   */
  getLinkMap(index: number): LinkMap {
    const maps = this._getMapsObjType('link');
    const map = maps[index];
    if (map instanceof LinkMap) {
      return map;
    } else {
      throw new Error('map is not an instance of LinkMap');
    }
  }

  /**
   * Get all LinkMap as array
   *
   * @returns {LinkMap[]}
   * @memberof Rule
   */
  getLinkMaps(): LinkMap[] {
    // return <LinkMap[]> this._getMapsObjType('link');
    const maps = this._getMapsObj()['links'];
    return maps;
  }

  /**
   * Verify if one of links is matched
   *
   * @param {(string | null)} pattern
   * @returns {boolean}
   * @memberof Rule
   */
  matchLink(pattern: string | null, options: gf.TRuleMapOptions = this.getLinkMapOptions()): boolean {
    return this._matchMaps('link', pattern, options);
  }

  //
  // STRING VALUE MAPS
  //
  addValueMap(value?: any, text?: string): ValueMap {
    const data: gf.TValueMapData = ValueMap.getDefaultdata();
    const m = new ValueMap(value, text, data);
    this.valueMaps.push(m);
    this.data.valueData.push(data);
    return m;
  }

  /**
   * Clone ValueMap at position
   *
   * @param {number} index
   * @returns {ValueMap}
   * @memberof Rule
   */
  cloneValueMap(index: number): ValueMap {
    const data = this.getValueMap(index).getData();
    return this.addValueMap().import(data);
  }

  /**
   * Remove a ValueMap at position
   *
   * @param {number} index
   * @memberof Rule
   */
  removeValueMap(index: number) {
    this.data.valueData.splice(index, 1);
    this.valueMaps.splice(index, 1);
  }

  /**
   * Get a ValueMap at position
   *
   * @param {number} index
   * @returns {ValueMap}
   * @memberof Rule
   */
  getValueMap(index: number): ValueMap {
    return this.valueMaps[index];
  }

  /**
   * Get all ValueMaps as array
   *
   * @returns {ValueMap[]}
   * @memberof Rule
   */
  getValueMaps(): ValueMap[] {
    return this.valueMaps;
  }

  //
  // STRING RANGE VALUE MAPS
  //
  /**
   * Add a RangeMap
   *
   * @param {*} [from]
   * @param {*} [to]
   * @param {*} [text]
   * @returns {RangeMap}
   * @memberof Rule
   */
  addRangeMap(from?: any, to?: any, text?: any): RangeMap {
    const data = RangeMap.getDefaultData();
    const m = new RangeMap(from, to, text, data);
    this.rangeMaps.push(m);
    this.data.rangeData.push(data);
    return m;
  }

  /**
   * Clone RangeMap at position
   *
   * @param {number} index
   * @returns {RangeMap}
   * @memberof Rule
   */
  cloneRangeMap(index: number): RangeMap {
    const data = this.getRangeMap(index).getData();
    return this.addRangeMap().import(data);
  }

  /**
   * Remove a RangeMap at position
   *
   * @param {number} index
   * @memberof Rule
   */
  removeRangeMap(index: number) {
    this.data.rangeData.splice(index, 1);
    this.rangeMaps.splice(index, 1);
  }

  /**
   * Get a RangeMap at position
   *
   * @param {number} index
   * @returns {RangeMap}
   * @memberof Rule
   */
  getRangeMap(index: number): RangeMap {
    return this.rangeMaps[index];
  }

  /**
   * Get all RangeMaps as array
   *
   * @returns {RangeMap[]}
   * @memberof Rule
   */
  getRangeMaps(): RangeMap[] {
    return this.rangeMaps;
  }

  //TODO : remove
  // hideRangeMap(index: number): this {
  //   this.getRangeMap(index).hide();
  //   return this;
  // }

  //TODO : remove
  // showRangeMap(index: number): this {
  //   this.getRangeMap(index).show();
  //   return this;
  // }

  //
  // DIVERS
  //

  /**
   * Get executed time of last execution of rule
   *
   * @returns {string}
   * @memberof Rule
   */
  getExectedTime(): string {
    return typeof this.execTimes === 'number' ? `${this.execTimes.toFixed(2)} ms` : `${this.execTimes} ms`;
  }

  //
  // METRICS
  //

  //
  // THRESHOLDS
  //
  /**
   * Get color according to value
   *
   * @param {number} value
   * @returns {string} html color
   * @memberof Rule
   */
  getThresholdColor(value: any): string {
    switch (this.data.type) {
      case 'number':
        return this._getColorForNumberTH(value);
        break;

      case 'string':
        return this._getColorForStringTH(value);
        break;

      case 'date':
        return this._getColorForDateTH(value);
        break;

      default:
        throw new Error('Data type unknown' + this.data.type);
        break;
    }
  }

  /**
   * Get a color between 2 colors with a ratio
   *
   * @private
   * @param {string} beginColor
   * @param {string} endColor
   * @param {number} ratio
   * @returns {string}
   * @memberof Rule
   */
  // _getColorForRatio(beginColor: string, endColor: string, ratio: number): string {
  //   let color = endColor;
  //   try {
  //     color = chroma
  //       .scale([beginColor, endColor])
  //       .mode('lrgb')(ratio)
  //       .hex();
  //   } catch (error) {
  //     color = endColor;
  //   }
  //   return color;
  // }

  /**
   * Get a value between 2 values with a ratio
   *
   * @private
   * @param {number} beginValue
   * @param {number} endValue
   * @param {number} ratio
   * @returns
   * @memberof Rule
   */
  // _getValueForRatio(beginValue: number, endValue: number, ratio: number) {
  //   return beginValue + (endValue - beginValue) * ratio;
  // }

  /**
   * Get a ratio, used for parameters of _getColorForRatio
   *
   * @private
   * @param {number} beginValue
   * @param {number} endValue
   * @param {number} value
   * @returns {number}
   * @memberof Rule
   */
  // _getRatioForValue(beginValue: number, endValue: number, value: number): number {
  //   if (value < beginValue || value > endValue) {
  //     throw new Error(
  //       `Cannot calculate ratio for value ${value} because value is less than ${beginValue} or greater than ${endValue}`
  //     );
  //   }
  //   let absoluteDistance = endValue - beginValue;
  //   let valueDistanceFromMin = value - beginValue;
  //   let ratio = valueDistanceFromMin / absoluteDistance;
  //   return ratio;
  // }

  _getColorForNumberTH(value: number): string {
    const index = this._getIndexNumberTHForValue(value);
    if (this.data.gradient) {
      if (index === 0) {
        return this.numberTH[index].getColor();
      }
      if (index === this.numberTH.length - 1) {
        return this.numberTH[index].getColor();
      }
      const beginColor = this.numberTH[index].getColor();
      const beginValue = this.numberTH[index].getValue();
      const endColor = this.numberTH[index + 1].getColor();
      const endValue = this.numberTH[index + 1].getValue();
      const ratio = $GF.calculateRatioForValue(beginValue, endValue, value);
      return $GF.calculateColorForRatio(beginColor, endColor, ratio);
    }
    return this.numberTH[index].getColor();
  }

  _getIndexTHForValue(value: any): number {
    switch (this.data.type) {
      case 'number':
        return this._getIndexNumberTHForValue(value);
        break;
      case 'string':
        return this._getIndexStringTHForValue(value);
        break;
      case 'date':
        return this._getIndexDateTHForValue(value);
        break;
      default:
        throw new Error('Type of threshold unknown : ' + this.data.type);
        break;
    }
  }

  _getIndexNumberTHForValue(value: number): number {
    let index = -1;
    for (let i = 0; i < this.numberTH.length; i++) {
      const th = this.numberTH[i];
      // Base
      if (i === 0) {
        index = i;
      } else {
        if (!th.isHidden()) {
          if (th.match(value)) {
            index = i;
          } else {
            break;
          }
        }
      }
    }
    return index;
  }

  _getIndexStringTHForValue(value: string): number {
    let index = -1;
    for (let i = 0; i < this.stringTH.length; i++) {
      const th = this.stringTH[i];
      // Base
      if (i === 0) {
        index = i;
      } else {
        if (!th.isHidden() && th.match(value)) {
          index = i;
        }
      }
    }
    return index;
  }

  _getColorForStringTH(value: string): string {
    return this.stringTH[this._getIndexStringTHForValue(value)].getColor();
  }

  _getIndexDateTHForValue(value: string): number {
    let index = -1;
    for (let i = 0; i < this.dateTH.length; i++) {
      const th = this.dateTH[i];
      // Base
      if (i === 0) {
        index = i;
      } else {
        if (!th.isHidden() && th.match(value)) {
          index = i;
        }
      }
    }
    return index;
  }

  _getColorForDateTH(value: string): string {
    return this.dateTH[this._getIndexDateTHForValue(value)].getColor();
  }

  /**
   * Get color according level (-1,0,1,2...)
   *
   * @param {*} level
   * @returns
   * @memberof Rule
   */
  getThresholdColorForLevel(level: number): string {
    const index = this.getThresholdIndexForLevel(level);
    const th = this.getThreshold(index);
    return th.getColor();
  }

  /**
   * Return an index for a level
   *
   * @param {number} level
   * @returns {number}
   * @memberof Rule
   */
  getThresholdIndexForLevel(level: number): number {
    let length = this.getThresholds().length;
    if (this.data.invert) {
      return level;
    }
    return length - 1 - level;
  }

  /**
   * Return Level according to value and rule options
   *
   * @param {number} value
   * @returns 0, 1 or 2
   * @memberof Rule
   */
  getThresholdLevel(value: any): number {
    let index = this._getIndexTHForValue(value);
    let length = this.getThresholds().length;
    if (this.data.invert && index !== -1) {
      return index;
    }
    if (index !== -1) {
      return length - 1 - index;
    }
    return index;
  }

  /**
   * Get the level according objet TH
   *
   * @param {ObjectTH} th
   * @returns {number}
   * @memberof Rule
   */
  getThresholdLevelForTH(th: ObjectTH): number {
    const ths = this.getThresholds();
    const index = ths.indexOf(th);
    if (index !== -1) {
      return this.data.invert ? index : this.getThresholdCount() - 1 - index;
    }
    return index;
  }

  /**
   * Get the level according index
   *
   * @param {ObjectTH} th
   * @returns {number}
   * @memberof Rule
   */
  getThresholdLevelForIndex(index: number): number {
    if (index !== -1) {
      return this.data.invert ? index : this.getThresholdCount() - 1 - index;
    }
    return index;
  }

  /**
   * Get value for this metric
   *
   * @param {Metric} metric
   * @returns {(string | number | null)}
   * @memberof Rule
   */
  getValueForMetric(metric: ObjectMetric): string | number | null {
    if (this.matchMetric(metric)) {
      try {
        const value = metric.getValue(this.data.aggregation, this.data.column);
        return value;
      } catch (error) {
        GFLog.error('Datapoint for metric is null', error);
        return null;
      }
    }
    return '-';
  }

  /**
   * Get formatting value according unit
   *
   * @param {Metric} metric
   * @returns {string}
   * @memberof Rule
   */
  getFormattedValueForMetric(metric: ObjectMetric): string {
    const formattedValue = this.getValueForMetric(metric);
    return this.getFormattedValue(formattedValue);
  }

  /**
   * Format a one value according rule
   *
   * @param {*} value
   * @returns
   * @memberof Rule
   */
  getFormattedValue(value: any) {
    // Number
    if (this.data.type === 'number') {
      if (!_isFinite(value)) {
        return 'null';
      }
      if (value === null || value === void 0) {
        return '-';
      }
      let decimals = this._decimalPlaces(value);
      decimals = typeof this.data.decimals === 'number' ? Math.min(this.data.decimals, decimals) : decimals;
      return grafana.formatValue(value, this.data.unit, this.data.decimals);
    }

    if (this.data.type === 'string') {
      if (value === null || value === void 0) {
        value = 'null';
      }

      if (_isArray(value)) {
        value = value.join(', ');
      }
      const mappingType = this.data.mappingType || 0;
      if (mappingType === 1 && this.valueMaps) {
        for (let i = 0; i < this.valueMaps.length; i += 1) {
          const map = this.valueMaps[i];
          if (!map.isHidden() && map.match(value)) {
            return map.getFormattedText(value);
          }
        }
        return value.toString();
      }

      if (mappingType === 2 && this.rangeMaps) {
        for (let i = 0; i < this.rangeMaps.length; i += 1) {
          const map = this.rangeMaps[i];
          if (!map.isHidden() && map.match(value)) {
            return map.getFormattedText(value);
          }
        }
        return value.toString();
      }

      if (value === null || value === void 0) {
        return 'null';
      }
    }

    if (this.data.type === 'date') {
      if (value === undefined || value === null) {
        return '-';
      }

      if (_isArray(value)) {
        value = value[0];
      }

      let d = grafana.getFormatedDate(value, this.data.dateFormat);
      return d;
    }
    return value;
  }

  // _defaultValueFormatter(value: any) {
  //   if (value === null || value === void 0 || value === undefined) {
  //     return '';
  //   }

  //   if (_isArray(value)) {
  //     value = value.join(', ');
  //   }

  //   if (this.data.sanitize) {
  //     return this.$sanitize(value);
  //   }
  //   return _escape(value);
  // }

  $sanitize(value: any) {
    throw new Error('Method not implemented.');
  }

  _decimalPlaces(num: string) {
    const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) {
      return 0;
    }
    return Math.max(
      0,
      // Number of digits right of decimal point.
      (match[1] ? match[1].length : 0) -
        // Adjust for scientific notation.
        (match[2] ? +match[2] : 0)
    );
  }

  // TODO : _On_metric_metric_updated
  // updateMetrics() {
  //   const metrics = this.ctrl.metricHandler?.getMetrics();
  //   this.metrics.clear();
  //   metrics?.forEach(metric => {
  //     if (this.matchMetric(metric)) {
  //       this.metrics.set(metric.uid, metric);
  //     }
  //   });
  //   this.onRefreshed();
  // }

  initCycle(): this {
    this.highestLevel = -1;
    this.highestFormattedValue = '';
    this.highestColor = '';
    this.highestValue = '';
    this.execTimes = 0;
    return this;
  }



  // complete(): this {
  //   this.completed = true;
  //   // this.refresh();
  //   this.onCompleted();
  //   return this;
  // }

  //
  // Metrics
  //
  /**
   * Return boolean if metrics is matched by rule
   *
   * @param {Metric} metric
   * @returns {boolean}
   * @memberof Rule
   */
  matchMetric(metric: ObjectMetric): boolean {
    if (this.data.metricType === 'serie' && metric.type === 'serie') {
      return $GF.utils.matchString(metric.getName(), this.data.pattern);
    }
    if (this.data.metricType === 'table' && metric.type === 'table') {
      return metric.getName() === this.data.refId;
    }
    return false;
  }

  clearMetrics(): this {
    this.metrics.clear();
    return this;
  }

  // updateMetricList(metric: ObjectMetric): this {
  //   if (metric !== null && metric !== undefined) {
  //     if (this.matchMetric(metric)) {
  //       this.metrics.set(metric.uid, metric);
  //     } else {
  //       this.metrics.delete(metric.uid);
  //     }
  //   }
  //   // this.onRefreshed();
  //   return this;
  // }

  // removeMetric(metric: ObjectMetric) {
  //   if (metric !== null && metric !== undefined) {
  //     this.metrics.delete(metric.uid);
  //   }
  // }

  hasMetric(metric: ObjectMetric): boolean {
    return this.metrics.has(metric.uid);
  }

  //#############################################################
  //### EVENTS
  //#############################################################
  private _on_metricHandler_metric_deleted(metric: ObjectMetric) {
    if(this.metrics.has(metric.uid)) {
      this.metrics.delete(metric.uid)
      this.update();
    }
  }

  private _on_metricHandler_metric_created(metric: ObjectMetric) {
    if(this.matchMetric(metric)) {
      this.metrics.set(metric.uid, metric);
      this.update();
    }
  }









//HISTORY

  //
  // Events
  //
  // async onDestroyed() {
  //   const funcName = 'onDestroyed';
  //   GFLog.debug(`${this.constructor.name}.${funcName}() : ${this.uid}`);
  //   this.ctrl.eventHandler.emit(this, 'destroyed');
  //   this.ctrl.eventHandler.unsubscribes(this);
  //   this.clear();
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
  //   // this.ctrl.eventHandler.emit(this, 'completed');
  // }

  //
  // RXJS Observer
  //
  // getMetric$changed(): Observer<ObjectMetric> {
  //   const self = this;
  //   const funcName = 'getMetric$changed';
  //   return {
  //     next: (metric: ObjectMetric) => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (self.metricCompleted) {
  //         self.metricCompleted = false;
  //         self.metrics.clear();
  //       }
  //       if (metric !== null && self.matchMetric(metric)) {
  //         self.metrics.set(metric.uid, metric);
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().complete() : ${this.uid}`);
  //     },
  //   };
  // }

  // getMetric$refreshed(): Observer<ObjectMetric> {
  //   const self = this;
  //   const funcName = 'getMetric$refreshed';
  //   return {
  //     next: (metric: ObjectMetric) => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (metric !== null && self.metrics.has(metric.uid)) {
  //         if (self.metricCompleted) {
  //           self.metricCompleted = false;
  //         }
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().complete() : ${this.uid}`);
  //     },
  //   };
  // }

  // getMetric$completed(): Observer<ObjectMetric> {
  //   const self = this;
  //   const funcName = 'getMetric$completed';
  //   return {
  //     next: (metric: ObjectMetric) => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (!self.metricCompleted) {
  //         self.complete();
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().complete() : ${this.uid}`);
  //     },
  //   };
  // }

  // getState$changed(): Observer<State> {
  //   const self = this;
  //   const funcName = 'getState$changed';
  //   return {
  //     next: (state: State) => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().next() : ${this.uid}`);
  //       if (state === null) {
  //         self.change();
  //       }
  //     },
  //     error: err => {
  //       GFLog.error(err);
  //     },
  //     complete: () => {
  //       GFLog.debug(`${this.constructor.name}.${funcName}().complete() : ${this.uid}`);
  //     },
  //   };
  // }
}
