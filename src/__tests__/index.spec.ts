import {
  GroundTruth,
  LaneBoundary,
  LaneBoundary_BoundaryPoint,
  LaneBoundary_Classification_Type,
  MovingObject,
  MovingObject_Type,
  MovingObject_VehicleClassification,
  MovingObject_VehicleClassification_LightState_BrakeLightState,
  MovingObject_VehicleClassification_LightState_GenericLightState,
  MovingObject_VehicleClassification_LightState_IndicatorState,
  MovingObject_VehicleClassification_Type,
  StationaryObject,
} from "@lichtblick/asam-osi-types";
import { ExtensionContext } from "@lichtblick/suite";
import { DeepRequired } from "ts-essentials";

import {
  activate,
  buildLaneBoundaryMetadata,
  buildVehicleMetadata,
  determineTheNeedToRerender,
} from "../index";

jest.mock(
  "../trafficsigns",
  () => ({
    preloadDynamicTextures: () => {},
  }),
  { virtual: true },
);

jest.mock("../trafficlights", () => {}, { virtual: true });

describe("OSI Visualizer: Message Converter", () => {
  const mockRegisterMessageConverter = jest.fn();
  const mockExtensionContext = {} as ExtensionContext;
  const mockBase = {
    dimension: {
      width: 1,
      height: 1,
      length: 1,
    },
    position: {
      x: 0,
      y: 0,
      z: 0,
    },
    orientation: {
      yaw: 0,
      pitch: 0,
      roll: 0,
    },
  };
  const mockMovingObject = {
    id: {
      value: 0,
    },
    base: mockBase,
    type: {
      value: MovingObject_Type.VEHICLE,
    },
    vehicle_attributes: {
      bbcenter_to_rear: {
        x: 0,
        y: 0,
        z: 0,
      },
    },
    vehicle_classification: {
      type: {
        value: MovingObject_VehicleClassification_Type.SMALL_CAR,
      },
      light_state: {},
    },
  } as unknown as DeepRequired<MovingObject>;
  const mockStationaryObject = {
    id: {
      value: 1,
    },
    base: mockBase,
    classification: {
      color: 0,
      type: 0,
      material: 0,
      density: 0,
    },
  } as unknown as DeepRequired<StationaryObject>;
  const mockLaneBoundary = {
    id: {
      value: 2,
    },
    boundary_line: [
      {
        position: {
          x: 0,
          y: 0,
          z: 0,
        },
        width: 1,
      },
    ],
    classification: {
      type: {
        value: LaneBoundary_Classification_Type.NO_LINE,
      },
    },
  } as unknown as DeepRequired<LaneBoundary>;
  const mockMessageData = {
    timestamp: {
      seconds: 0,
      nanos: 0,
    },
    host_vehicle_id: {
      value: 0,
    },
    moving_object: [mockMovingObject],
    stationary_object: [mockStationaryObject],
    lane_boundary: [mockLaneBoundary],
    traffic_sign: [],
    traffic_light: [],
  } as GroundTruth;

  beforeEach(() => {
    mockExtensionContext.registerMessageConverter = mockRegisterMessageConverter;
    mockRegisterMessageConverter.mockClear();
  });

  it("registers the message converters", () => {
    activate(mockExtensionContext);
    expect(mockRegisterMessageConverter).toHaveBeenCalledTimes(5);
  });

  it("converts a simple message { fromSchemaName: osi_3_msgs/osi_GroundTruth toSchemaName: foxglove.SceneUpdate }", () => {
    activate(mockExtensionContext);
    const messageConverterArgs = mockRegisterMessageConverter.mock.calls[0][0];
    const result = messageConverterArgs.converter(mockMessageData);
    expect(result.deletions).toBeDefined();
    expect(result.entities).toBeDefined();
  });
});

describe("OSI Visualizer: Moving Objects", () => {
  it("builds metadata  for vehicle moving objects", () => {
    const input = {
      type: 5,
      light_state: {
        indicator_state: 5,
        brake_light_state: 4,
        head_light: 3,
      },
    } as DeepRequired<MovingObject_VehicleClassification>;
    expect(buildVehicleMetadata(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "type",
          value: MovingObject_VehicleClassification_Type[input.type],
        }),
        expect.objectContaining({
          key: "light_state.indicator_state",
          value:
            MovingObject_VehicleClassification_LightState_IndicatorState[
              input.light_state.indicator_state
            ],
        }),
        expect.objectContaining({
          key: "light_state.brake_light_state",
          value:
            MovingObject_VehicleClassification_LightState_BrakeLightState[
              input.light_state.brake_light_state
            ],
        }),
        expect.objectContaining({
          key: "light_state.head_light",
          value:
            MovingObject_VehicleClassification_LightState_GenericLightState[
              input.light_state.head_light
            ],
        }),
      ]),
    );
  });
});

describe("OSI Visualizer: Lane Boundaries", () => {
  it("builds metadata for lane boundaries", () => {
    const mockLaneBoundaryPoint = {
      position: { x: 0, y: 0, z: 0 },
      width: 2.0,
    } as DeepRequired<LaneBoundary_BoundaryPoint>;
    const mockLaneBoundary = {
      id: { value: 123 },
      classification: {
        type: LaneBoundary_Classification_Type.SOLID_LINE,
      },
      boundary_line: [mockLaneBoundaryPoint],
    } as DeepRequired<LaneBoundary>;

    expect(buildLaneBoundaryMetadata(mockLaneBoundary)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "type",
          value: LaneBoundary_Classification_Type[mockLaneBoundary.classification.type],
        }),
        expect.objectContaining({
          key: "width",
          value: mockLaneBoundaryPoint.width.toString(),
        }),
      ]),
    );
  });
});

describe("OsiGroundTruthVisualizer: Static Objects Render Cache", () => {
  it("determines if the last render time is greater then the current render time", () => {
    const pastNsec = { sec: 0, nsec: 980000000 };
    const futureNsec = { sec: 0, nsec: 990000000 };
    const futureSec = { sec: 1, nsec: 0 };
    expect(
      determineTheNeedToRerender(futureNsec, pastNsec), // SHOULD rerender when the current render time is in the past relative to the last render time
    ).toBe(true);
    expect(
      determineTheNeedToRerender(pastNsec, futureNsec), // SHOULD NOT rerender when the current render time is in the future (by less than 10000000 nanoseconds) relative to the last render time
    ).toBe(false);
    expect(
      determineTheNeedToRerender(futureNsec, futureNsec), // SHOULD NOT rerender when the current render time is the same as the last render time
    ).toBe(false);
    expect(
      determineTheNeedToRerender(futureNsec, futureSec), // SHOULD NOT rerender when the current render time is in the future (the next second but less than 10000000 nanoseconds) relative to the last render time
    ).toBe(false);
    expect(
      determineTheNeedToRerender(pastNsec, futureSec), // SHOULD rerender when the current render time is in the future (by more than 10000000 nanoseconds) relative to the last render time
    ).toBe(true);
  });
});
