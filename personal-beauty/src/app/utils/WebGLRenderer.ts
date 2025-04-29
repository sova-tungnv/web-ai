// src/app/utils/WebGLRenderer.ts
// Renderer sử dụng WebGL để giảm tải CPU và tối ưu hiệu suất xử lý hình ảnh

export class WebGLRenderer {
    private gl: WebGLRenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private motionProgram: WebGLProgram | null = null;
    private downscaleProgram: WebGLProgram | null = null;
    private textures: { [key: string]: WebGLTexture } = {};
    private framebuffers: { [key: string]: WebGLFramebuffer } = {};
    private canvas: HTMLCanvasElement;
    private isInitialized = false;
    private videoTexture: WebGLTexture | null = null;
    private positionBuffer: WebGLBuffer | null = null;
    private texCoordBuffer: WebGLBuffer | null = null;
  
    // Khởi tạo với canvas đã có hoặc tạo mới
    constructor(canvas?: HTMLCanvasElement) {
      if (canvas) {
        this.canvas = canvas;
      } else {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 320;
        this.canvas.height = 240;
      }
    }
  
    // Khởi tạo WebGL context và các shader cần thiết
    public init(): boolean {
      try {
        // Tạo WebGL context với các tùy chọn tối ưu cho hiệu suất
        this.gl = this.canvas.getContext('webgl', {
          alpha: false,              // Không cần kênh alpha
          antialias: false,          // Tắt anti-aliasing
          depth: false,              // Không cần depth buffer
          stencil: false,            // Không cần stencil buffer
          preserveDrawingBuffer: false, // Không giữ buffer sau khi vẽ
          premultipliedAlpha: false, // Tối ưu cho xử lý hình ảnh
          powerPreference: 'high-performance' // Yêu cầu GPU hiệu suất cao
        }) as WebGLRenderingContext;
  
        if (!this.gl) {
          console.error('[WebGLRenderer] WebGL không được hỗ trợ, sử dụng Canvas 2D');
          return false;
        }
  
        // Tạo chương trình shader cho phát hiện chuyển động
        this.motionProgram = this.createProgram(this.gl, this.getVertexShader(), this.getMotionDetectionShader());
        
        // Tạo chương trình shader để giảm độ phân giải
        this.downscaleProgram = this.createProgram(this.gl, this.getVertexShader(), this.getDownscaleShader());
        
        // Tạo chương trình shader mặc định
        this.program = this.createProgram(this.gl, this.getVertexShader(), this.getFragmentShader());
        
        if (!this.program || !this.motionProgram || !this.downscaleProgram) {
          console.error('[WebGLRenderer] Không thể tạo chương trình shader');
          return false;
        }
  
        // Tạo và thiết lập buffer cho hình vuông đầy màn hình
        const gl = this.gl;
        
        // Vị trí cho hình vuông đầy màn hình
        const positions = [
          -1, -1,  // bottom left
           1, -1,  // bottom right
          -1,  1,  // top left
           1,  1,  // top right
        ];
        
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        // Tọa độ texture
        const texCoords = [
          0, 0,  // bottom left
          1, 0,  // bottom right
          0, 1,  // top left
          1, 1,  // top right
        ];
        
        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
        
        // Tạo texture cho video input
        this.videoTexture = this.createTexture(this.gl);
        
        // Tạo texture và framebuffer cho phát hiện chuyển động
        this.createMotionDetectionResources();
        
        console.log('[WebGLRenderer] Khởi tạo thành công');
        this.isInitialized = true;
        return true;
      } catch (e) {
        console.error('[WebGLRenderer] Lỗi khởi tạo WebGL:', e);
        return false;
      }
    }
  
    // Tạo resource cho phát hiện chuyển động
    private createMotionDetectionResources(): void {
      if (!this.gl) return;
      
      const gl = this.gl;
      
      // Tạo texture cho frame trước đó
      this.textures['prevFrame'] = this.createTexture(gl);
      
      // Tạo texture và framebuffer cho kết quả phát hiện chuyển động
      this.textures['motionResult'] = this.createTexture(gl);
      this.framebuffers['motion'] = gl.createFramebuffer()!;
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers['motion']);
      gl.bindTexture(gl.TEXTURE_2D, this.textures['motionResult']);
      
      // Khởi tạo texture với kích thước nhỏ để phát hiện chuyển động nhanh hơn
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 64, 48, 0, gl.RGBA, gl.UNSIGNED_BYTE, null
      );
      
      // Attach texture vào framebuffer
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures['motionResult'], 0
      );
      
      // Reset binding
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  
    // Cập nhật texture từ video element
    public updateVideoTexture(video: HTMLVideoElement): boolean {
      if (!this.gl || !this.videoTexture || !this.isInitialized) return false;
  
      try {
        const gl = this.gl;
        
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        // Upload video frame vào texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        
        return true;
      } catch (e) {
        console.error('[WebGLRenderer] Lỗi cập nhật video texture:', e);
        return false;
      }
    }
  
    // Phát hiện chuyển động bằng WebGL shader
    public detectMotion(): { hasMotion: boolean, diffSum: number } {
      if (!this.gl || !this.motionProgram || !this.videoTexture || !this.textures['prevFrame'] || !this.isInitialized) {
        return { hasMotion: false, diffSum: 0 };
      }
  
      try {
        const gl = this.gl;
        
        // Sử dụng framebuffer cho kết quả phát hiện chuyển động
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers['motion']);
        
        // Đặt viewport phù hợp với kích thước framebuffer
        gl.viewport(0, 0, 64, 48);
        
        // Sử dụng chương trình shader phát hiện chuyển động
        gl.useProgram(this.motionProgram);
        
        // Thiết lập vị trí và tọa độ texture
        const positionLocation = gl.getAttribLocation(this.motionProgram, 'a_position');
        const texCoordLocation = gl.getAttribLocation(this.motionProgram, 'a_texCoord');
        
        // Thiết lập vị trí vertex
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Thiết lập tọa độ texture
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Thiết lập uniform cho textures
        const currentTextureLocation = gl.getUniformLocation(this.motionProgram, 'u_currentTexture');
        const previousTextureLocation = gl.getUniformLocation(this.motionProgram, 'u_previousTexture');
        
        // Kích hoạt texture units
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        gl.uniform1i(currentTextureLocation, 0);
        
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures['prevFrame']);
        gl.uniform1i(previousTextureLocation, 1);
        
        // Vẽ hình vuông đầy màn hình
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Đọc kết quả từ framebuffer
        const pixels = new Uint8Array(64 * 48 * 4);
        gl.readPixels(0, 0, 64, 48, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Tính tổng sự khác biệt
        let diffSum = 0;
        for (let i = 0; i < pixels.length; i += 16) { // Lấy mẫu để tăng tốc
          diffSum += pixels[i]; // Chỉ cần kênh đỏ vì shader đã đặt tất cả các kênh giống nhau
        }
        
        // Cập nhật texture trước đó bằng frame hiện tại
        gl.bindTexture(gl.TEXTURE_2D, this.textures['prevFrame']);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.canvas.width, this.canvas.height, 0);
        
        // Trả về kết quả
        const threshold = 1200; // Ngưỡng chuyển động, điều chỉnh theo nhu cầu
        return { hasMotion: diffSum > threshold, diffSum };
      } catch (e) {
        console.error('[WebGLRenderer] Lỗi phát hiện chuyển động:', e);
        return { hasMotion: false, diffSum: 0 };
      } finally {
        // Reset binding
        if (this.gl) {
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        }
      }
    }
  
    // Trích xuất dữ liệu hình ảnh đã giảm độ phân giải
    public extractImageData(width: number, height: number): ImageData | null {
      if (!this.gl || !this.downscaleProgram || !this.videoTexture || !this.isInitialized) {
        return null;
      }
  
      try {
        const gl = this.gl;
        
        // Tạo hoặc cập nhật framebuffer và texture nếu chưa có
        if (!this.framebuffers['extract']) {
          this.framebuffers['extract'] = gl.createFramebuffer()!;
          this.textures['extract'] = this.createTexture(gl);
        }
        
        // Resize texture nếu kích thước thay đổi
        gl.bindTexture(gl.TEXTURE_2D, this.textures['extract']);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        
        // Attach texture vào framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers['extract']);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures['extract'], 0);
        
        // Thiết lập viewport
        gl.viewport(0, 0, width, height);
        
        // Sử dụng chương trình shader downscale
        gl.useProgram(this.downscaleProgram);
        
        // Thiết lập vị trí và tọa độ texture
        const positionLocation = gl.getAttribLocation(this.downscaleProgram, 'a_position');
        const texCoordLocation = gl.getAttribLocation(this.downscaleProgram, 'a_texCoord');
        
        // Thiết lập vị trí vertex
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Thiết lập tọa độ texture
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Thiết lập uniform cho texture
        const textureLocation = gl.getUniformLocation(this.downscaleProgram, 'u_texture');
        
        // Kích hoạt texture unit
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        gl.uniform1i(textureLocation, 0);
        
        // Vẽ hình vuông đầy màn hình
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Đọc dữ liệu pixel từ framebuffer
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Tạo ImageData từ dữ liệu pixel
        return new ImageData(new Uint8ClampedArray(pixels), width, height);
      } catch (e) {
        console.error('[WebGLRenderer] Lỗi trích xuất dữ liệu hình ảnh:', e);
        return null;
      } finally {
        // Reset binding
        if (this.gl) {
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        }
      }
    }
  
    // Tạo texture
    private createTexture(gl: WebGLRenderingContext): WebGLTexture {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      
      // Thiết lập tham số texture
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      
      // Khởi tạo với texture rỗng
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
      );
      
      return texture!;
    }
  
    // Tạo shader program
    private createProgram(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string): WebGLProgram | null {
      // Biên dịch vertex shader
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader!, vertexShaderSource);
      gl.compileShader(vertexShader!);
      
      // Kiểm tra lỗi
      if (!gl.getShaderParameter(vertexShader!, gl.COMPILE_STATUS)) {
        console.error('[WebGLRenderer] Lỗi biên dịch vertex shader:', gl.getShaderInfoLog(vertexShader!));
        gl.deleteShader(vertexShader);
        return null;
      }
      
      // Biên dịch fragment shader
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader!, fragmentShaderSource);
      gl.compileShader(fragmentShader!);
      
      // Kiểm tra lỗi
      if (!gl.getShaderParameter(fragmentShader!, gl.COMPILE_STATUS)) {
        console.error('[WebGLRenderer] Lỗi biên dịch fragment shader:', gl.getShaderInfoLog(fragmentShader!));
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
      }
      
      // Tạo và link program
      const program = gl.createProgram();
      gl.attachShader(program!, vertexShader!);
      gl.attachShader(program!, fragmentShader!);
      gl.linkProgram(program!);
      
      // Kiểm tra lỗi
      if (!gl.getProgramParameter(program!, gl.LINK_STATUS)) {
        console.error('[WebGLRenderer] Lỗi liên kết program:', gl.getProgramInfoLog(program!));
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
      }
      
      return program;
    }
  
    // Vertex shader cơ bản cho tất cả các chương trình
    private getVertexShader(): string {
      return `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        
        void main() {
          gl_Position = vec4(a_position, 0, 1);
          v_texCoord = a_texCoord;
        }
      `;
    }
  
    // Fragment shader mặc định cho chuyển đổi cơ bản
    private getFragmentShader(): string {
      return `
        precision mediump float;
        
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        
        void main() {
          gl_FragColor = texture2D(u_texture, v_texCoord);
        }
      `;
    }
  
    // Fragment shader cho phát hiện chuyển động
    private getMotionDetectionShader(): string {
      return `
        precision mediump float;
        
        uniform sampler2D u_currentTexture;
        uniform sampler2D u_previousTexture;
        varying vec2 v_texCoord;
        
        void main() {
          vec4 current = texture2D(u_currentTexture, v_texCoord);
          vec4 previous = texture2D(u_previousTexture, v_texCoord);
          
          // Tính độ sáng của từng pixel
          float currentLuma = dot(current.rgb, vec3(0.299, 0.587, 0.114));
          float previousLuma = dot(previous.rgb, vec3(0.299, 0.587, 0.114));
          
          // Tính sự khác biệt tuyệt đối
          float diff = abs(currentLuma - previousLuma);
          
          // Tăng độ nhạy bằng cách thêm tỷ lệ
          diff = diff * 2.0;
          
          // Đầu ra là sự khác biệt (dùng cùng một giá trị cho tất cả các kênh)
          gl_FragColor = vec4(diff, diff, diff, 1.0);
        }
      `;
    }
  
    // Fragment shader cho việc giảm độ phân giải
    private getDownscaleShader(): string {
      return `
        precision mediump float;
        
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        
        void main() {
          // Áp dụng bộ lọc làm mịn đơn giản (box filter)
          vec2 texelSize = vec2(1.0) / vec2(textureSize(u_texture, 0));
          vec4 color = texture2D(u_texture, v_texCoord);
          
          // Lấy mẫu 4 pixel lân cận để làm mịn
          color += texture2D(u_texture, v_texCoord + vec2(texelSize.x, 0.0));
          color += texture2D(u_texture, v_texCoord + vec2(-texelSize.x, 0.0));
          color += texture2D(u_texture, v_texCoord + vec2(0.0, texelSize.y));
          color += texture2D(u_texture, v_texCoord + vec2(0.0, -texelSize.y));
          
          // Tính trung bình
          color = color / 5.0;
          
          gl_FragColor = color;
        }
      `;
    }
  
    // Giải phóng tài nguyên
    public dispose(): void {
      if (!this.gl) return;
      
      const gl = this.gl;
      
      // Xóa buffers
      if (this.positionBuffer) {
        gl.deleteBuffer(this.positionBuffer);
      }
      
      if (this.texCoordBuffer) {
        gl.deleteBuffer(this.texCoordBuffer);
      }
      
      // Xóa textures
      if (this.videoTexture) {
        gl.deleteTexture(this.videoTexture);
      }
      
      for (const key in this.textures) {
        gl.deleteTexture(this.textures[key]);
      }
      
      // Xóa framebuffers
      for (const key in this.framebuffers) {
        gl.deleteFramebuffer(this.framebuffers[key]);
      }
      
      // Xóa programs
      if (this.program) {
        gl.deleteProgram(this.program);
      }
      
      if (this.motionProgram) {
        gl.deleteProgram(this.motionProgram);
      }
      
      if (this.downscaleProgram) {
        gl.deleteProgram(this.downscaleProgram);
      }
      
      // Reset các thuộc tính
      this.textures = {};
      this.framebuffers = {};
      this.videoTexture = null;
      this.program = null;
      this.motionProgram = null;
      this.downscaleProgram = null;
      this.positionBuffer = null;
      this.texCoordBuffer = null;
      this.isInitialized = false;
      
      console.log('[WebGLRenderer] Đã giải phóng tài nguyên WebGL');
    }
}
