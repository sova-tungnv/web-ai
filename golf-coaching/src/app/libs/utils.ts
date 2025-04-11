interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }

// Calculate the angle between three points and b is the vertex
export const calculateAngle = (a: {x: number; y:number}, b: {x:number; y:number}, c: {x: number; y:number}): number => {
    const vecterBA = {x: a.x-b.x, y: a.y-b.y};
    const vecterBC = {x: c.x-b.x, y: c.y-b.y};
    const angleBA = Math.atan2(vecterBA.y, vecterBA.x);
    const angleBC = Math.atan2(vecterBC.y, vecterBC.x);
    let angle = (angleBC - angleBA) * (180/Math.PI); // Convert radians to degrees
    if (angle < 0) angle += 360; // Ensure angle is positive
    if(angle > 180) angle = 360 - angle; // Ensure angle is acute
    return angle;
};

// Calculate middle point between two points
export const getMiddlePoint = (point1: {x: number; y:number}, point2: {x:number; y:number}): any => {
    return {
        x: (point1.x + point2.x) / 2,
        y: (point1.y + point2.y) / 2
    };
};

// Smoothing function for landmarks using moving average
export const makeSmoothLandmarks = (currentLandmarks: Landmark[], previousLandmarks: Landmark[], soothingFactor: number = 0.8): any => {
    if(!previousLandmarks) return currentLandmarks;

    return currentLandmarks.map((landmark, index) => {
        const prevLandmark = previousLandmarks[index];
        return {
            x: soothingFactor * prevLandmark.x + (1 - soothingFactor) * landmark.x,
            y: soothingFactor * prevLandmark.y + (1 - soothingFactor) * landmark.y,
            z: soothingFactor * prevLandmark.z + (1 - soothingFactor) * landmark.z,
            visibility: landmark.visibility, // Keep visibility as is
        };
    });
};