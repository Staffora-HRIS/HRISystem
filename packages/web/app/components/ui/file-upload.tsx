import { useState, useRef, useCallback } from "react";
import { Upload, X, File, Image, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface FileUploadProps {
  onFilesSelected?: (files: File[]) => void;
  onUpload?: (files: File[]) => Promise<void>;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number; // in bytes
  disabled?: boolean;
  className?: string;
}

interface UploadedFile {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string) => {
  if (type.startsWith("image/")) return Image;
  if (type.includes("pdf") || type.includes("document")) return FileText;
  return File;
};

export function FileUpload({
  onFilesSelected,
  onUpload,
  accept,
  multiple = false,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB default
  disabled = false,
  className,
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (maxSize && file.size > maxSize) {
      return `File exceeds maximum size of ${formatFileSize(maxSize)}`;
    }
    if (accept) {
      const acceptedTypes = accept.split(",").map((t) => t.trim());
      const fileType = file.type;
      const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
      const isAccepted = acceptedTypes.some(
        (type) =>
          type === fileType ||
          type === fileExt ||
          (type.endsWith("/*") && fileType.startsWith(type.replace("/*", "/")))
      );
      if (!isAccepted) {
        return "File type not accepted";
      }
    }
    return null;
  };

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const validFiles: UploadedFile[] = [];

      for (const file of fileArray) {
        if (files.length + validFiles.length >= maxFiles) break;

        const error = validateFile(file);
        validFiles.push({
          file,
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          progress: 0,
          status: error ? "error" : "pending",
          error: error || undefined,
        });
      }

      setFiles((prev) => [...prev, ...validFiles]);
      onFilesSelected?.(validFiles.filter((f) => f.status === "pending").map((f) => f.file));
    },
    [files.length, maxFiles, onFilesSelected, accept, maxSize]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUpload = async () => {
    if (!onUpload) return;

    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as const, progress: 0 } : f
      )
    );

    try {
      await onUpload(pendingFiles.map((f) => f.file));
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "success" as const, progress: 100 } : f
        )
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading"
            ? { ...f, status: "error" as const, error: "Upload failed" }
            : f
        )
      );
    }
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          isDragging && "border-blue-500 bg-blue-50",
          disabled
            ? "border-gray-200 bg-gray-50 cursor-not-allowed"
            : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
          aria-label="File upload input"
        />
        <Upload className={cn("h-10 w-10 mx-auto mb-3", isDragging ? "text-blue-500" : "text-gray-400")} />
        <p className="font-medium text-gray-700">
          {isDragging ? "Drop files here" : "Drop files here or click to upload"}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {accept ? `Accepted: ${accept}` : "Any file type"} · Max {formatFileSize(maxSize)}
        </p>
        {multiple && (
          <p className="text-xs text-gray-400 mt-1">Up to {maxFiles} files</p>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((uploadedFile) => {
            const FileIcon = getFileIcon(uploadedFile.file.type);
            return (
              <div
                key={uploadedFile.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  uploadedFile.status === "error" && "border-red-200 bg-red-50",
                  uploadedFile.status === "success" && "border-green-200 bg-green-50"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                  <FileIcon className="h-5 w-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{uploadedFile.file.name}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">{formatFileSize(uploadedFile.file.size)}</span>
                    {uploadedFile.status === "uploading" && (
                      <span className="text-blue-600">Uploading... {uploadedFile.progress}%</span>
                    )}
                    {uploadedFile.status === "success" && (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Uploaded
                      </span>
                    )}
                    {uploadedFile.status === "error" && (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {uploadedFile.error}
                      </span>
                    )}
                  </div>
                  {uploadedFile.status === "uploading" && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${uploadedFile.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(uploadedFile.id);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  aria-label={`Remove ${uploadedFile.file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Button */}
      {onUpload && pendingCount > 0 && (
        <Button onClick={handleUpload} className="w-full">
          Upload {pendingCount} file{pendingCount !== 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}

interface SimpleFileInputProps {
  value?: File | null;
  onChange?: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function SimpleFileInput({
  value,
  onChange,
  accept,
  disabled = false,
  placeholder = "Choose file...",
  className,
}: SimpleFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onChange?.(file);
  };

  const handleClear = () => {
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
        aria-label="File input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={cn(
          "flex-1 flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm",
          disabled ? "bg-gray-100 cursor-not-allowed" : "hover:border-gray-300"
        )}
      >
        <File className="h-4 w-4 text-gray-400" />
        <span className={value ? "text-gray-900 truncate" : "text-gray-400"}>
          {value ? value.name : placeholder}
        </span>
      </button>
      {value && (
        <Button variant="ghost" size="sm" onClick={handleClear} aria-label="Clear file">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
