"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Check, CopyIcon, X } from "lucide-react";
import { useSocket } from "@/context/SocketProvider";
import toast from "react-hot-toast";
import { TailSpin } from "react-loader-spinner";
import Peer from "simple-peer";
import FileUpload from "./FileUpload";
import FileUploadBtn from "./FileUploadBtn";
import FileDownload from "./FileDownload";
import ShareLink from "./ShareLink";
import { useSearchParams } from "next/navigation";

const ShareCard = () => {
  const userDetails = useSocket();
  const [partnerId, setpartnerId] = useState("");
  const [isLoading, setisLoading] = useState(false);
  const [isCopied, setisCopied] = useState(false);
  const [currentConnection, setcurrentConnection] = useState(false);
  const peerRef = useRef<any>();
  const [userId, setuserId] = useState<any>();
  const [signalingData, setsignalingData] = useState<any>();
  const [acceptCaller, setacceptCaller] = useState(false);
  const [terminateCall, setterminateCall] = useState(false);
  const [fileUploads, setfileUploads] = useState<any[]>([]);
  const fileInputRef = useRef<any>();
  const [downloadFiles, setdownloadFiles] = useState<any[]>([]);
  const [fileUploadProgress, setfileUploadProgress] = useState<number[]>([]);
  const [fileDownloadProgress, setfileDownloadProgress] = useState<number[]>([]);
  const [fileNameState, setfileNameState] = useState<any>();
  const [fileSending, setfileSending] = useState(false);
  const [fileReceiving, setfileReceiving] = useState(false);
  const [name, setname] = useState<any>();
  const searchParams = useSearchParams();

  // used web worker for expensive work
  const workerRef = useRef<Worker>();

  const addUserToSocketDB = () => {
    userDetails.socket.on("connect", () => {
      setuserId(userDetails.userId);
      userDetails.socket.emit("details", {
        socketId: userDetails.socket.id,
        uniqueId: userDetails.userId,
      });
    });
  };

  function CopyToClipboard(value: any) {
    setisCopied(true);
    toast.success("Copied");
    navigator.clipboard.writeText(value);
    setTimeout(() => {
      setisCopied(false);
    }, 3000);
  }

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../utils/worker.ts", import.meta.url)
    );

    addUserToSocketDB();

    if (searchParams.get("code")) {
      setpartnerId(String(searchParams.get("code")));
    }

    userDetails.socket.on("signaling", (data: any) => {
      setacceptCaller(true);
      setsignalingData(data);
      setpartnerId(data.from);
    });

    workerRef.current?.addEventListener("message", (event: any) => {
      if (event.data?.progress) {
        setfileDownloadProgress((prev) => {
          const newProgress = [...prev];
          newProgress[event.data.index] = Number(event.data.progress);
          return newProgress;
        });
      } else if (event.data?.blob) {
        setdownloadFiles((prev) => [...prev, event.data?.blob]);
        setfileDownloadProgress((prev) => {
          const newProgress = [...prev];
          newProgress[event.data.index] = 0;
          return newProgress;
        });
        setfileReceiving(false);
      }
    });

    return () => {
      peerRef.current?.destroy();
      if (peerRef.current) {
        setacceptCaller(false);
        setacceptCaller(false);
        userDetails.socket.off();
      }
      workerRef.current?.terminate();
    };
  }, []);

  const callUser = () => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: {
        iceServers: [
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:numb.viagenie.ca",
            credential: "muazkh",
            username: "webrtc@live.com",
          },
        ],
      },
    });
    peerRef.current = peer;

    peer.on("signal", (data) => {
      userDetails.socket.emit("send-signal", {
        from: userDetails.userId,
        signalData: data,
        to: partnerId,
      });
    });

    peer.on("data", (data) => {
      const parsedData = JSON.parse(data);

      if (parsedData.chunk) {
        setfileReceiving(true);
        handleReceivingData(parsedData.chunk, parsedData.index);
      } else if (parsedData.done) {
        handleReceivingData(parsedData, parsedData.index);
        toast.success("File received successfully");
      } else if (parsedData.info) {
        handleReceivingData(parsedData, parsedData.index);
      }
    });

    userDetails.socket.on("callAccepted", (data: any) => {
      peer.signal(data.signalData);
      setisLoading(false);
      setcurrentConnection(true);
      setterminateCall(true);
      toast.success(`Successful connection with ${partnerId}`);
      userDetails.setpeerState(peer);
    });

    peer.on("close", () => {
      setpartnerId("");
      setcurrentConnection(false);
      toast.error(`${partnerId} disconnected`);
      setfileUploads([]);
      setterminateCall(false);
      setpartnerId("");
      userDetails.setpeerState(undefined);
    });

    peer.on("error", (err) => {
      console.log(err);
    });
  };

  const acceptUser = () => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
    });

    peerRef.current = peer;
    userDetails.setpeerState(peer);

    peer.on("signal", (data) => {
      userDetails.socket.emit("accept-signal", {
        signalData: data,
        to: partnerId,
      });
      setcurrentConnection(true);
      setacceptCaller(false);
      setterminateCall(true);
      toast.success(`Successful connection with ${partnerId}`);
    });

    peer.on("data", (data) => {
      const parsedData = JSON.parse(data);

      if (parsedData.chunk) {
        setfileReceiving(true);
        handleReceivingData(parsedData.chunk, parsedData.index);
      } else if (parsedData.done) {
        handleReceivingData(parsedData, parsedData.index);
        toast.success("File received successfully");
      } else if (parsedData.info) {
        handleReceivingData(parsedData, parsedData.index);
      }
    });

    peer.signal(signalingData.signalData);

    peer.on("close", () => {
      setpartnerId("");
      setcurrentConnection(false);
      toast.error(`${partnerId} disconnected`);
      setfileUploads([]);
      setterminateCall(false);
      setpartnerId("");
      userDetails.setpeerState(undefined);
    });

    peer.on("error", (err) => {
      console.log(err);
    });
  };

  const handleConnectionMaking = () => {
    setisLoading(true);
    if (partnerId && partnerId.length == 10) {
      callUser();
    } else {
      setisLoading(false);
      toast.error("Enter correct Peer's Id");
    }
  };

  const handleFileUploadBtn = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e: any) => {
    const files = Array.from(e.target.files);
    setfileUploads((prev) => [...prev, ...files]);
    setfileUploadProgress((prev) => [...prev, ...files.map(() => 0)]);
  };

  function handleReceivingData(data: any, index: number) {
    if (data.info) {
      workerRef.current?.postMessage({
        status: "fileInfo",
        fileSize: data.fileSize,
        index,
      });
      setfileNameState(data.fileName);
      setname(data.fileName);
    } else if (data.done) {
      workerRef.current?.postMessage({ status: "download", index });
    } else {
      workerRef.current?.postMessage({ ...data, index });
    }
  }

  const handleWebRTCUpload = (index: number) => {
    const peer = peerRef.current;

    if (!currentConnection) {
      toast.error("No connection made, please connect first");
      return;
    }

    const file = fileUploads[index];
    const chunkSize = 16 * 1024;
    let offset = 0;

    const readAndSendChunk = () => {
      const chunk = file.slice(offset, offset + chunkSize);

      const reader = new FileReader();

      if (offset == 0) {
        setfileSending(true);
        const fileInfo = {
          info: true,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          index,
        };
        peer.write(JSON.stringify(fileInfo));
      }

      reader.onload = (event) => {
        if (event.target?.result) {
          const chunkData: any = event.target.result;
          const uint8ArrayChunk = new Uint8Array(chunkData);

          const progressPayload = {
            chunk: Array.from(uint8ArrayChunk),
            progress: (offset / file.size) * 100,
            index,
          };
          peer.write(JSON.stringify(progressPayload));
          setfileUploadProgress((prev) => {
            const newProgress = [...prev];
            newProgress[index] = (offset / file.size) * 100;
            return newProgress;
          });

          offset += chunkSize;

          if (offset < file.size) {
            readAndSendChunk();
          } else {
            peer.write(
              JSON.stringify({
                done: true,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                index,
              })
            );
            setfileUploadProgress((prev) => {
              const newProgress = [...prev];
              newProgress[index] = 100;
              return newProgress;
            });
            setfileSending(false);
            toast.success("Sended file successfully");
          }
        }
      };

      reader.readAsArrayBuffer(chunk);
    };

    readAndSendChunk();
  };

  const [loadingText, setLoadingText] = useState("Loading");

  useEffect(() => {
    if (!userId) {
      const interval = setInterval(() => {
        setLoadingText((prev) => (prev.length < 10 ? prev + " ." : "Loading"));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [userId]);

  const handleRemoveFile = (index: number) => {
    setfileUploads((prev) => prev.filter((_, i) => i !== index));
    setfileUploadProgress((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveDownload = (index: number) => {
    setdownloadFiles((prev) => prev.filter((_, i) => i !== index));
    setfileDownloadProgress((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (size: number) => {
    if (size >= 1024 * 1024 * 1024) {
      return (size / (1024 * 1024 * 1024)).toFixed(1) + "GB";
    } else if (size >= 1024 * 1024) {
      return (size / (1024 * 1024)).toFixed(1) + "MB";
    } else if (size >= 1024) {
      return (size / 1024).toFixed(1) + "KB";
    } else {
      return size + "B";
    }
  };
  
  return (
    <Card className="sm:max-w-[450px] max-w-[95%] shadow-lg rounded-lg overflow-hidden bg-white dark:bg-[#181818]">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4">
        <h2 className="text-xl font-semibold">Share Files Securely</h2>
      </CardHeader>
      <CardContent className="mt-8 p-4">
        <form>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="name">My ID</Label>
              <div className="flex flex-row justify-left items-center space-x-2">
                <div className="flex border rounded-md px-3 py-2 text-sm h-10 w-full bg-gray-100 dark:bg-[#2E2E2E]">
                  {userId ? (
                    userId
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {loadingText}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  type="button"
                  className="p-4"
                  onClick={() => CopyToClipboard(userDetails?.userId)}
                  disabled={userId ? false : true}
                >
                  {isCopied ? (
                    <Check size={15} color="green" />
                  ) : (
                    <CopyIcon size={15} />
                  )}
                </Button>
                <ShareLink userCode={userId} />
              </div>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label htmlFor="name">Peer`s ID</Label>
              <div className="flex flex-row justify-left items-center space-x-2">
                <Input
                  id="name"
                  placeholder="ID"
                  onChange={(e) => setpartnerId(e.target.value)}
                  disabled={terminateCall}
                  value={partnerId}
                  className="bg-gray-100 dark:bg-[#2E2E2E]"
                />
                <Button
                  variant="outline"
                  type="button"
                  className="flex items-center justify-center p-4 w-[160px]"
                  onClick={handleConnectionMaking}
                  disabled={terminateCall}
                >
                  {isLoading ? (
                    <>
                      <div className="scale-0 hidden dark:flex dark:scale-100">
                        <TailSpin color="white" height={18} width={18} />
                      </div>
                      <div className="scale-100 flex dark:scale-0 dark:hidden">
                        <TailSpin color="black" height={18} width={18} />
                      </div>
                    </>
                  ) : (
                    <p>Connect</p>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label htmlFor="name">Connection Status</Label>
              <div className="flex flex-row justify-left items-center space-x-2">
                <div className="border rounded-lg px-3 py-2 text-sm h-10 w-full bg-gray-100 dark:bg-[#2E2E2E]">
                  {currentConnection ? partnerId : "No connection"}
                </div>
                {terminateCall ? (
                  <Button
                    variant="destructive"
                    type="button"
                    onClick={() => {
                      peerRef.current.destroy();
                    }}
                  >
                    Terminate
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col border rounded-lg px-3 py-2 text-sm w-full bg-gray-100 dark:bg-[#2E2E2E] gap-y-2 max-h-[300px] overflow-y-auto">
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-[16px]">Upload</Label>
                <FileUploadBtn
                  inputRef={fileInputRef}
                  uploadBtn={handleFileUploadBtn}
                  handleFileChange={handleFileChange}
                />
              </div>

              {fileUploads.map((file, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center border rounded-md p-2 mb-2 animate-dropdown bg-white dark:bg-[#1E1E1E]"
                >
                  <div className="flex flex-col w-full">
                    <div className="flex justify-between items-center">
                      <FileUpload
                        fileName={file.name}
                        fileProgress={fileUploadProgress[index]}
                        handleClick={() => handleWebRTCUpload(index)}
                        showProgress={fileSending}
                      />
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                      >
                        <X size={15} />
                      </Button>
                    </div>
                    <small className="text-right text-gray-500 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            {downloadFiles.map((file, index) => (
              <div
                key={index}
                className="flex flex-col border rounded-lg px-3 py-2 text-sm w-full bg-gray-100 dark:bg-[#2E2E2E] gap-y-2 animate-dropdown"
              >
                <div className="flex justify-between items-center">
                  <Label className="font-semibold text-[16px]">Download</Label>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => handleRemoveDownload(index)}
                  >
                    <X size={15} />
                  </Button>
                </div>
                <div className="flex justify-between items-center">
                  <FileDownload
                    fileName={fileNameState}
                    fileReceivingStatus={fileReceiving}
                    fileProgress={fileDownloadProgress[index]}
                    fileRawData={file}
                  />
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => handleRemoveDownload(index)}
                  >
                    <X size={15} />
                  </Button>
                </div>
                <small className="text-right text-gray-500 dark:text-gray-400">
                  {formatFileSize(file.size)}
                </small>
              </div>
            ))}
          </div>
        </form>
      </CardContent>
      {acceptCaller ? (
        <CardFooter className="flex justify-center">
          <div>
            <Button
              variant="outline"
              className="bg-green-500 text-white hover:bg-green-400"
              onClick={acceptUser}
            >
              Click here to receive call from {signalingData.from}
            </Button>
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
};

export default ShareCard;