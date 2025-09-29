import React from "react";
import pwnLogo from "../../assets/pwn_logo.png";

export const AuthHeader = (): JSX.Element => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>
        {`
          @keyframes subtle-glow {
            0%, 100% {
              text-shadow: 0 0 20px rgba(255, 255, 255, 0.15), 0 0 30px rgba(255, 255, 255, 0.1);
              filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.15));
            }
            50% {
              text-shadow: 0 0 25px rgba(255, 255, 255, 0.25), 0 0 40px rgba(255, 255, 255, 0.15);
              filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.25));
            }
          }
          @keyframes icon-glow {
            0%, 100% {
              filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.3))
                      drop-shadow(0 0 25px rgba(255, 255, 255, 0.2))
                      drop-shadow(0 0 35px rgba(255, 255, 255, 0.1));
            }
            50% {
              filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.4))
                      drop-shadow(0 0 30px rgba(255, 255, 255, 0.3))
                      drop-shadow(0 0 45px rgba(255, 255, 255, 0.15));
            }
          }
          .logo-hover:hover {
            transform: scale(1.05);
            transition: transform 0.3s ease;
          }
        `}
      </style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "nowrap",
          justifyContent: "center",
          marginLeft: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <h1
            className="text-white m-0 logo-hover"
            style={{
              fontFamily: "Inter",
              fontWeight: 800,
              fontSize: "52px",
              letterSpacing: "-0.12em",
              whiteSpace: "nowrap",
              animation: "subtle-glow 3s ease-in-out infinite",
              cursor: "pointer",
              marginRight: 0,
              marginBottom: 0,
              marginTop: 0,
              marginLeft: 0,
            }}
          >
            PwnChat
          </h1>
          <p
            className="logo-hover"
            style={{
              fontFamily: "Inter",
              fontWeight: 200,
              fontSize: "15px",
              letterSpacing: "-0.05em",
              marginTop: "-12%",
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
              color: "white",
              textAlign: "center",
              animation: "subtle-glow 3s ease-in-out infinite",
              cursor: "pointer",
            }}
          >
            be careful the little virus is spreading
          </p>
        </div>
        {/* <img
          alt="Pwn logo"
          src={pwnLogo}
          className="logo-hover"
          style={{
            height: "40px",
            width: "40px",
            objectFit: "cover",
            marginLeft: "1%",
            marginRight: "10px",
            marginBottom: "6px",
            flexShrink: 0,
            animation: "icon-glow 3s ease-in-out infinite",
            cursor: "pointer",
          }}
        /> */}
      </div>
    </div>
  );
};
