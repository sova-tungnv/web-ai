// Define interfaces for type safety
interface AngleRange {
    min: number;
    max: number;
    ideal: number;
  }
  
  interface Advice {
    tooLow: string;
    tooHigh: string;
  }
  
  interface ClubPostureStandard {
    spineAngle: AngleRange;
    shoulderAngle: AngleRange;
    kneeAngle: AngleRange;
    advice: {
      spineAngle: Advice;
      shoulderAngle: Advice;
      kneeAngle: Advice;
    };
  }
  
  interface UserAngles {
    spineAngle: number;
    shoulderAngle: number;
    kneeAngle: number;
  }
  
  interface Feedback {
    [key: string]: {
      value: number;
      message: string;
    };
  }
  
  // Define posture standards for all club types
  export const golfPostureStandards: { [key: string]: ClubPostureStandard } = {
    driver: {
      spineAngle: { min: 25, max: 35, ideal: 30 },
      shoulderAngle: { min: 10, max: 20, ideal: 15 },
      kneeAngle: { min: 150, max: 160, ideal: 155 },
      advice: {
        spineAngle: {
          tooLow: "Stand taller and tilt your back more.",
          tooHigh: "Reduce the back tilt."
        },
        shoulderAngle: {
          tooLow: "Raise your right shoulder.",
          tooHigh: "Reduce shoulder tilt."
        },
        kneeAngle: {
          tooLow: "Straighten your knees slightly.",
          tooHigh: "Bend your knees more."
        }
      }
    },
    fairway: {
      spineAngle: { min: 30, max: 40, ideal: 35 },
      shoulderAngle: { min: 5, max: 15, ideal: 10 },
      kneeAngle: { min: 150, max: 160, ideal: 155 },
      advice: {
        spineAngle: {
          tooLow: "Tilt your back more.",
          tooHigh: "Straighten your back slightly."
        },
        shoulderAngle: {
          tooLow: "Raise your right shoulder.",
          tooHigh: "Reduce shoulder tilt."
        },
        kneeAngle: {
          tooLow: "Straighten your knees slightly.",
          tooHigh: "Bend your knees more."
        }
      }
    },
    hybrid: {
      spineAngle: { min: 30, max: 40, ideal: 35 },
      shoulderAngle: { min: 5, max: 15, ideal: 10 },
      kneeAngle: { min: 150, max: 160, ideal: 155 },
      advice: {
        spineAngle: {
          tooLow: "Tilt your back more.",
          tooHigh: "Straighten your back slightly."
        },
        shoulderAngle: {
          tooLow: "Raise your right shoulder.",
          tooHigh: "Reduce shoulder tilt."
        },
        kneeAngle: {
          tooLow: "Straighten your knees slightly.",
          tooHigh: "Bend your knees more."
        }
      }
    },
    iron: {
      spineAngle: { min: 35, max: 45, ideal: 40 },
      shoulderAngle: { min: 5, max: 15, ideal: 10 },
      kneeAngle: { min: 150, max: 160, ideal: 155 },
      advice: {
        spineAngle: {
          tooLow: "Tilt your back more.",
          tooHigh: "Straighten your back slightly."
        },
        shoulderAngle: {
          tooLow: "Raise your right shoulder.",
          tooHigh: "Reduce shoulder tilt."
        },
        kneeAngle: {
          tooLow: "Straighten your knees slightly.",
          tooHigh: "Bend your knees more."
        }
      }
    },
    wedge: {
      spineAngle: { min: 40, max: 50, ideal: 45 },
      shoulderAngle: { min: 0, max: 10, ideal: 5 },
      kneeAngle: { min: 150, max: 160, ideal: 155 },
      advice: {
        spineAngle: {
          tooLow: "Tilt your back more for better ball control.",
          tooHigh: "Straighten your back slightly."
        },
        shoulderAngle: {
          tooLow: "Keep your shoulders more square.",
          tooHigh: "Reduce shoulder tilt."
        },
        kneeAngle: {
          tooLow: "Straighten your knees slightly.",
          tooHigh: "Bend your knees more."
        }
      }
    },
    putter: {
      spineAngle: { min: 10, max: 20, ideal: 15 },
      shoulderAngle: { min: 0, max: 5, ideal: 2.5 },
      kneeAngle: { min: 160, max: 170, ideal: 165 },
      advice: {
        spineAngle: {
          tooLow: "Stand taller with less bend.",
          tooHigh: "Bend forward slightly to see the ball."
        },
        shoulderAngle: {
          tooLow: "Keep your shoulders square.",
          tooHigh: "Reduce shoulder tilt slightly."
        },
        kneeAngle: {
          tooLow: "Straighten your knees more.",
          tooHigh: "Bend your knees slightly."
        }
      }
    }
  };
  
  // Analyze posture function with TypeScript types
  export const analyzePosture = (clubType: string, userAngles: UserAngles): Feedback => {
    const standards = golfPostureStandards[clubType];
    if (!standards) {
      throw new Error(`No posture standards found for club type: ${clubType}`);
    }
  
    const feedback: Feedback = {};
  
    Object.keys(standards).forEach((key) => {
      if (key !== "advice") {
        const userValue = userAngles[key as keyof UserAngles];
        const { min, max } = standards[key as keyof ClubPostureStandard] as AngleRange;
        const advice = standards.advice[key as keyof ClubPostureStandard["advice"]];
  
        if (userValue < min) {
          feedback[key] = { value: userValue, message: advice.tooLow };
        } else if (userValue > max) {
          feedback[key] = { value: userValue, message: advice.tooHigh };
        } else {
          feedback[key] = { value: userValue, message: "Good, keep it up!" };
        }
      }
    });
  
    return feedback;
  };